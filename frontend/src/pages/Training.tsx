import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Box, Button, Card, CardContent, Chip, FormControl, Grid, InputLabel,
  LinearProgress, MenuItem, Select, TextField, Typography, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Dialog, DialogTitle, DialogContent, Tabs, Tab,
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import VisibilityIcon from '@mui/icons-material/Visibility'
import ImageIcon from '@mui/icons-material/Image'
import CloseIcon from '@mui/icons-material/Close'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  getDatasets, startTraining, getTrainingJobs, getTrainingJob, stopTraining,
  getTrainingMetrics, getTrainingArtifacts, getTrainingLog,
  type Dataset, type TrainingJobItem,
} from '../api/client'
import { useStore } from '../store/useStore'

const MODEL_OPTIONS = ['yolov8n', 'yolov8s', 'yolov8m', 'yolov8l', 'yolov8x', 'yolo11n', 'yolo11s', 'yolo11m']

export default function Training() {
  const { showSnackbar } = useStore()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [jobs, setJobs] = useState<TrainingJobItem[]>([])
  const [form, setForm] = useState({ dataset_id: 0, model_type: 'yolov8n', epochs: 100, batch_size: 16, img_size: 640 })
  const [selectedJob, setSelectedJob] = useState<TrainingJobItem | null>(null)
  const [metrics, setMetrics] = useState<Record<string, number[]>>({})
  const [artifacts, setArtifacts] = useState<any[]>([])
  const [logText, setLogText] = useState('')
  const [tab, setTab] = useState(0)
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadJobs = useCallback(async () => {
    try {
      const [ds, tj] = await Promise.all([getDatasets(), getTrainingJobs()])
      setDatasets(ds.data)
      setJobs(tj.data)
    } catch { /* empty */ }
  }, [])

  useEffect(() => { loadJobs() }, [loadJobs])

  const handleStart = async () => {
    if (!form.dataset_id) { showSnackbar('請選擇數據集', 'error'); return }
    try {
      const { data } = await startTraining(form)
      showSnackbar('訓練已啟動', 'success')
      loadJobs()
      openJobDetail(data)
    } catch (e: any) {
      showSnackbar(e?.response?.data?.detail || '啟動失敗', 'error')
    }
  }

  const handleStop = async (id: number) => {
    try {
      await stopTraining(id)
      showSnackbar('訓練已停止', 'info')
      loadJobs()
    } catch { showSnackbar('停止失敗', 'error') }
  }

  const openJobDetail = async (job: TrainingJobItem) => {
    setSelectedJob(job)
    setTab(0)
    setLogText('')
    setMetrics({})
    setArtifacts([])

    // Connect WebSocket for live logs
    if (wsRef.current) wsRef.current.close()
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/logs/${job.id}`)
    wsRef.current = ws
    ws.onmessage = (e) => {
      if (e.data) {
        setLogText((prev) => prev + e.data)
        setTimeout(() => {
          if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
        }, 50)
      }
    }
    ws.onclose = () => {}

    // Also fetch existing log
    try {
      const { data } = await getTrainingLog(job.id)
      if (data.log) setLogText(data.log)
    } catch { /* empty */ }

    // Poll metrics
    pollRef.current = setInterval(async () => {
      try {
        const [mRes, aRes, jRes] = await Promise.all([
          getTrainingMetrics(job.id),
          getTrainingArtifacts(job.id),
          getTrainingJob(job.id),
        ])
        setMetrics(mRes.data)
        setArtifacts(aRes.data)
        if (jRes.data.status !== 'running') {
          clearInterval(pollRef.current!)
          loadJobs()
        }
      } catch { /* empty */ }
    }, 5000)
  }

  useEffect(() => () => {
    if (wsRef.current) wsRef.current.close()
    if (pollRef.current) clearInterval(pollRef.current)
  }, [])

  const closeDetail = () => {
    setSelectedJob(null)
    if (wsRef.current) wsRef.current.close()
    if (pollRef.current) clearInterval(pollRef.current)
    loadJobs()
  }

  const chartData = (() => {
    const epochs = metrics['epoch'] || []
    return epochs.map((ep, i) => {
      const row: Record<string, number> = { epoch: ep }
      for (const [key, vals] of Object.entries(metrics)) {
        if (key !== 'epoch' && vals[i] !== undefined) row[key] = vals[i]
      }
      return row
    })
  })()

  const lossKeys = Object.keys(metrics).filter((k) => k.includes('loss'))
  const mapKeys = Object.keys(metrics).filter((k) => k.includes('mAP') || k.includes('precision') || k.includes('recall'))
  const CHART_COLORS = ['#7C4DFF', '#00E5FF', '#69F0AE', '#FF6E40', '#FFEAA7', '#DDA0DD']

  return (
    <Box>
      <Typography variant="h4" gutterBottom>YOLO 模型訓練</Typography>

      <Grid container spacing={3}>
        {/* Config */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="h6">訓練配置</Typography>
              <FormControl fullWidth>
                <InputLabel>數據集</InputLabel>
                <Select label="數據集" value={form.dataset_id}
                  onChange={(e) => setForm({ ...form, dataset_id: Number(e.target.value) })}>
                  <MenuItem value={0} disabled>-- 請選擇 --</MenuItem>
                  {datasets.map((d) => (
                    <MenuItem key={d.id} value={d.id}>{d.name} ({d.image_count} 張)</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>模型</InputLabel>
                <Select label="模型" value={form.model_type}
                  onChange={(e) => setForm({ ...form, model_type: e.target.value })}>
                  {MODEL_OPTIONS.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField label="Epochs" type="number" value={form.epochs}
                onChange={(e) => setForm({ ...form, epochs: +e.target.value })} />
              <TextField label="Batch Size" type="number" value={form.batch_size}
                onChange={(e) => setForm({ ...form, batch_size: +e.target.value })} />
              <TextField label="Image Size" type="number" value={form.img_size}
                onChange={(e) => setForm({ ...form, img_size: +e.target.value })} />
              <Button variant="contained" size="large" startIcon={<PlayArrowIcon />} onClick={handleStart}>
                開始訓練
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Jobs list */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>訓練任務</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>ID</TableCell>
                      <TableCell>模型</TableCell>
                      <TableCell>數據集</TableCell>
                      <TableCell>Epochs</TableCell>
                      <TableCell>狀態</TableCell>
                      <TableCell>操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {jobs.map((j) => (
                      <TableRow key={j.id} hover>
                        <TableCell>{j.id}</TableCell>
                        <TableCell>{j.model_type}</TableCell>
                        <TableCell>#{j.dataset_id}</TableCell>
                        <TableCell>{j.epochs}</TableCell>
                        <TableCell>
                          <Chip label={j.status} size="small"
                            color={j.status === 'completed' ? 'success' : j.status === 'running' ? 'primary' : j.status === 'failed' ? 'error' : 'default'} />
                        </TableCell>
                        <TableCell>
                          <IconButton size="small" onClick={() => openJobDetail(j)} title="查看詳情">
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                          {j.status === 'running' && (
                            <IconButton size="small" color="error" onClick={() => handleStop(j.id)} title="停止">
                              <StopIcon fontSize="small" />
                            </IconButton>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Job Detail Dialog */}
      <Dialog open={!!selectedJob} onClose={closeDetail} maxWidth="xl" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between' }}>
          訓練詳情 — {selectedJob?.model_type} (Job #{selectedJob?.id})
          <IconButton onClick={closeDetail}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
            <Tab label="實時日誌" />
            <Tab label="訓練曲線" />
            <Tab label="輸出文件" />
          </Tabs>

          {tab === 0 && (
            <Paper
              ref={logRef}
              variant="outlined"
              sx={{
                p: 2, height: 500, overflow: 'auto',
                bgcolor: '#0a0a0a', fontFamily: '"Fira Code", "Consolas", monospace',
                fontSize: 12, lineHeight: 1.7,
                '&::-webkit-scrollbar': { width: 6 },
                '&::-webkit-scrollbar-thumb': { bgcolor: '#333', borderRadius: 3 },
              }}
            >
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#ddd' }}>{logText || '等待日誌輸出...'}</pre>
            </Paper>
          )}

          {tab === 1 && (
            <Grid container spacing={2}>
              {lossKeys.length > 0 && (
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" gutterBottom>Loss 曲線</Typography>
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="epoch" stroke="#888" />
                      <YAxis stroke="#888" />
                      <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333' }} />
                      <Legend />
                      {lossKeys.map((k, i) => (
                        <Line key={k} type="monotone" dataKey={k} stroke={CHART_COLORS[i % CHART_COLORS.length]}
                          dot={false} strokeWidth={2} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </Grid>
              )}
              {mapKeys.length > 0 && (
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" gutterBottom>mAP / Precision / Recall</Typography>
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="epoch" stroke="#888" />
                      <YAxis stroke="#888" domain={[0, 1]} />
                      <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333' }} />
                      <Legend />
                      {mapKeys.map((k, i) => (
                        <Line key={k} type="monotone" dataKey={k} stroke={CHART_COLORS[(i + 3) % CHART_COLORS.length]}
                          dot={false} strokeWidth={2} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </Grid>
              )}
              {chartData.length === 0 && (
                <Grid item xs={12}>
                  <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                    等待訓練數據...
                  </Typography>
                </Grid>
              )}
            </Grid>
          )}

          {tab === 2 && (
            <Grid container spacing={1}>
              {artifacts.filter((a) => ['png', 'jpg'].includes(a.type)).map((a) => (
                <Grid item xs={6} md={3} key={a.relative_path}>
                  <Card
                    sx={{ cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }}
                    onClick={() => setPreviewImg(`/api/training/jobs/${selectedJob?.id}/artifacts/${a.relative_path}`)}
                  >
                    <Box sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <ImageIcon fontSize="small" />
                      <Typography variant="caption" noWrap>{a.name}</Typography>
                    </Box>
                  </Card>
                </Grid>
              ))}
              {artifacts.filter((a) => a.type === 'pt').map((a) => (
                <Grid item xs={6} md={3} key={a.relative_path}>
                  <Card sx={{ p: 1.5 }}>
                    <Typography variant="caption">{a.name}</Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {(a.size / 1024 / 1024).toFixed(1)} MB
                    </Typography>
                  </Card>
                </Grid>
              ))}
              {artifacts.length === 0 && (
                <Grid item xs={12}>
                  <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                    暫無輸出文件
                  </Typography>
                </Grid>
              )}
            </Grid>
          )}
        </DialogContent>
      </Dialog>

      {/* Image Preview */}
      <Dialog open={!!previewImg} onClose={() => setPreviewImg(null)} maxWidth="lg">
        <DialogContent>
          {previewImg && <img src={previewImg} style={{ maxWidth: '100%', borderRadius: 8 }} alt="artifact" />}
        </DialogContent>
      </Dialog>
    </Box>
  )
}
