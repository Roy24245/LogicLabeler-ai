import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Box, Button, Card, CardContent, Chip, FormControl, Grid, InputLabel,
  LinearProgress, MenuItem, Select, TextField, Typography, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Dialog, DialogTitle, DialogContent, Tabs, Tab, Tooltip,
  useTheme, alpha, Avatar, Divider,
} from '@mui/material'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import StopRoundedIcon from '@mui/icons-material/StopRounded'
import PauseRoundedIcon from '@mui/icons-material/PauseRounded'
import CancelRoundedIcon from '@mui/icons-material/CancelRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import ImageRoundedIcon from '@mui/icons-material/ImageRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import ModelTrainingRoundedIcon from '@mui/icons-material/ModelTrainingRounded'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  getDatasets, startTraining, getTrainingJobs, getTrainingJob, stopTraining,
  resumeTraining, cancelTraining, deleteTrainingJob,
  getTrainingMetrics, getTrainingArtifacts, getTrainingLog,
  type Dataset, type TrainingJobItem,
} from '../api/client'
import { useStore } from '../store/useStore'
import PreprocessDialog from '../components/PreprocessDialog'

const MODEL_OPTIONS = ['yolov8n', 'yolov8s', 'yolov8m', 'yolov8l', 'yolov8x', 'yolo11n', 'yolo11s', 'yolo11m']

const STATUS_CONFIG: Record<string, { color: 'success' | 'primary' | 'error' | 'warning' | 'default' | 'info'; label: string }> = {
  completed: { color: 'success', label: '已完成' },
  running: { color: 'primary', label: '運行中' },
  failed: { color: 'error', label: '失敗' },
  stopped: { color: 'warning', label: '已停止' },
  cancelled: { color: 'default', label: '已取消' },
  preparing: { color: 'info', label: '準備中' },
  pending: { color: 'default', label: '等待中' },
}

export default function Training() {
  const { showSnackbar } = useStore()
  const theme = useTheme()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [jobs, setJobs] = useState<TrainingJobItem[]>([])
  const [form, setForm] = useState({ dataset_id: 0, model_type: 'yolov8n', epochs: 100, batch_size: 16, img_size: 640 })
  const [selectedJob, setSelectedJob] = useState<TrainingJobItem | null>(null)
  const [metrics, setMetrics] = useState<Record<string, number[]>>({})
  const [artifacts, setArtifacts] = useState<any[]>([])
  const [logText, setLogText] = useState('')
  const [tab, setTab] = useState(0)
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const [preprocessOpen, setPreprocessOpen] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadJobs = useCallback(async () => {
    try { const [ds, tj] = await Promise.all([getDatasets(), getTrainingJobs()]); setDatasets(ds.data); setJobs(tj.data) } catch {}
  }, [])
  useEffect(() => { loadJobs() }, [loadJobs])

  const handleStartClick = () => { if (!form.dataset_id) { showSnackbar('請選擇數據集', 'error'); return }; setPreprocessOpen(true) }

  const handlePreprocessConfirm = async (config: { augmentations: string[]; preprocessing: Record<string, any> }) => {
    setPreprocessOpen(false)
    try {
      const payload: any = { ...form }
      if (config.augmentations.length > 0 || Object.keys(config.preprocessing).length > 0) {
        payload.preprocess = { augmentations: config.augmentations, preprocessing: config.preprocessing }
      }
      const { data } = await startTraining(payload)
      showSnackbar('訓練已啟動' + (config.augmentations.length > 0 ? `（含 ${config.augmentations.length} 項增強）` : ''), 'success')
      loadJobs(); openJobDetail(data)
    } catch (e: any) { showSnackbar(e?.response?.data?.detail || '啟動失敗', 'error') }
  }

  const handleStop = async (id: number) => {
    try { await stopTraining(id); showSnackbar('訓練已停止', 'info'); loadJobs(); refreshSelectedJob(id) } catch { showSnackbar('停止失敗', 'error') }
  }

  const handleResume = async (id: number) => {
    try {
      const { data } = await resumeTraining(id)
      showSnackbar('訓練已繼續', 'success')
      loadJobs()
      openJobDetail(data)
    } catch (e: any) { showSnackbar(e?.response?.data?.detail || '繼續失敗', 'error') }
  }

  const handleCancel = async (id: number) => {
    if (!confirm('確定取消此訓練任務？')) return
    try { await cancelTraining(id); showSnackbar('訓練已取消', 'info'); loadJobs(); refreshSelectedJob(id) } catch { showSnackbar('取消失敗', 'error') }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('確定刪除此訓練任務及其所有數據？')) return
    try {
      await deleteTrainingJob(id)
      showSnackbar('任務已刪除', 'info')
      if (selectedJob?.id === id) closeDetail()
      loadJobs()
    } catch { showSnackbar('刪除失敗', 'error') }
  }

  const refreshSelectedJob = async (id: number) => {
    try {
      const { data } = await getTrainingJob(id)
      if (selectedJob?.id === id) setSelectedJob(data)
    } catch {}
  }

  const openJobDetail = async (job: TrainingJobItem) => {
    setSelectedJob(job); setTab(0); setLogText(''); setMetrics({}); setArtifacts([])
    if (wsRef.current) wsRef.current.close()
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/logs/${job.id}`)
    wsRef.current = ws
    ws.onmessage = (e) => { if (e.data) { setLogText((prev) => prev + e.data); setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, 50) } }
    try { const { data } = await getTrainingLog(job.id); if (data.log) setLogText(data.log) } catch {}
    pollRef.current = setInterval(async () => {
      try {
        const [mRes, aRes, jRes] = await Promise.all([getTrainingMetrics(job.id), getTrainingArtifacts(job.id), getTrainingJob(job.id)])
        setMetrics(mRes.data); setArtifacts(aRes.data); setSelectedJob(jRes.data)
        if (jRes.data.status !== 'running' && jRes.data.status !== 'preparing') { clearInterval(pollRef.current!); loadJobs() }
      } catch {}
    }, 5000)
  }

  useEffect(() => () => { if (wsRef.current) wsRef.current.close(); if (pollRef.current) clearInterval(pollRef.current) }, [])

  const closeDetail = () => { setSelectedJob(null); if (wsRef.current) wsRef.current.close(); if (pollRef.current) clearInterval(pollRef.current); loadJobs() }

  const chartData = (() => {
    const epochs = metrics['epoch'] || []
    return epochs.map((ep, i) => { const row: Record<string, number> = { epoch: ep }; for (const [key, vals] of Object.entries(metrics)) { if (key !== 'epoch' && vals[i] !== undefined) row[key] = vals[i] }; return row })
  })()
  const lossKeys = Object.keys(metrics).filter((k) => k.includes('loss'))
  const mapKeys = Object.keys(metrics).filter((k) => k.includes('mAP') || k.includes('precision') || k.includes('recall'))
  const CHART_COLORS = ['#6750A4', '#0061A4', '#7D5260', '#1B8755', '#E8A317', '#B3261E']

  const jobStatus = selectedJob?.status || ''
  const isRunning = jobStatus === 'running' || jobStatus === 'preparing'
  const canResume = jobStatus === 'stopped' || jobStatus === 'failed'
  const canStop = isRunning
  const canCancel = isRunning || jobStatus === 'stopped'

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Avatar sx={{ bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main', width: 44, height: 44 }}>
          <ModelTrainingRoundedIcon />
        </Avatar>
        <Typography variant="h4">YOLO 模型訓練</Typography>
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="h6">訓練配置</Typography>
              <FormControl fullWidth>
                <InputLabel>數據集</InputLabel>
                <Select label="數據集" value={form.dataset_id} onChange={(e) => setForm({ ...form, dataset_id: Number(e.target.value) })}>
                  <MenuItem value={0} disabled>-- 請選擇 --</MenuItem>
                  {datasets.map((d) => <MenuItem key={d.id} value={d.id}>{d.name} ({d.image_count} 張)</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>模型</InputLabel>
                <Select label="模型" value={form.model_type} onChange={(e) => setForm({ ...form, model_type: e.target.value })}>
                  {MODEL_OPTIONS.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField label="Epochs" type="number" value={form.epochs} onChange={(e) => setForm({ ...form, epochs: +e.target.value })} />
              <TextField label="Batch Size" type="number" value={form.batch_size} onChange={(e) => setForm({ ...form, batch_size: +e.target.value })} />
              <TextField label="Image Size" type="number" value={form.img_size} onChange={(e) => setForm({ ...form, img_size: +e.target.value })} />
              <Button variant="contained" size="large" startIcon={<PlayArrowRoundedIcon />} onClick={handleStartClick} sx={{ borderRadius: 3 }}>
                開始訓練
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>訓練任務</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>ID</TableCell><TableCell>模型</TableCell><TableCell>數據集</TableCell>
                      <TableCell>Epochs</TableCell><TableCell>狀態</TableCell><TableCell align="right">操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {jobs.map((j) => {
                      const st = STATUS_CONFIG[j.status] || { color: 'default' as const, label: j.status }
                      const jRunning = j.status === 'running' || j.status === 'preparing'
                      const jCanResume = j.status === 'stopped' || j.status === 'failed'
                      const jCanCancel = jRunning || j.status === 'stopped'
                      return (
                        <TableRow key={j.id} hover>
                          <TableCell>{j.id}</TableCell>
                          <TableCell>{j.model_type}</TableCell>
                          <TableCell>#{j.dataset_id}</TableCell>
                          <TableCell>{j.epochs}</TableCell>
                          <TableCell><Chip label={st.label} size="small" color={st.color} /></TableCell>
                          <TableCell align="right">
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.25 }}>
                              <Tooltip title="查看詳情">
                                <IconButton size="small" onClick={() => openJobDetail(j)}><VisibilityRoundedIcon fontSize="small" /></IconButton>
                              </Tooltip>
                              {jCanResume && (
                                <Tooltip title="繼續訓練">
                                  <IconButton size="small" color="success" onClick={() => handleResume(j.id)}><PlayArrowRoundedIcon fontSize="small" /></IconButton>
                                </Tooltip>
                              )}
                              {jRunning && (
                                <Tooltip title="停止訓練">
                                  <IconButton size="small" color="warning" onClick={() => handleStop(j.id)}><PauseRoundedIcon fontSize="small" /></IconButton>
                                </Tooltip>
                              )}
                              {jCanCancel && (
                                <Tooltip title="取消訓練">
                                  <IconButton size="small" color="error" onClick={() => handleCancel(j.id)}><CancelRoundedIcon fontSize="small" /></IconButton>
                                </Tooltip>
                              )}
                              {!jRunning && (
                                <Tooltip title="刪除任務">
                                  <IconButton size="small" onClick={() => handleDelete(j.id)} sx={{ color: 'text.secondary' }}><DeleteRoundedIcon fontSize="small" /></IconButton>
                                </Tooltip>
                              )}
                            </Box>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {jobs.length === 0 && (
                      <TableRow><TableCell colSpan={6} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>尚無訓練任務</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Job Detail Dialog */}
      <Dialog open={!!selectedJob} onClose={closeDetail} maxWidth="xl" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600, pr: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            訓練詳情 — {selectedJob?.model_type} (Job #{selectedJob?.id})
            {selectedJob && (
              <Chip
                label={(STATUS_CONFIG[selectedJob.status] || { label: selectedJob.status }).label}
                size="small"
                color={(STATUS_CONFIG[selectedJob.status] || { color: 'default' as const }).color}
              />
            )}
          </Box>
          <IconButton onClick={closeDetail}><CloseRoundedIcon /></IconButton>
        </DialogTitle>

        {/* Control Bar */}
        {selectedJob && (
          <Box sx={{ px: 3, pb: 1, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            {canResume && (
              <Button variant="contained" color="success" size="small" startIcon={<PlayArrowRoundedIcon />}
                onClick={() => handleResume(selectedJob.id)} sx={{ borderRadius: 3 }}>
                繼續訓練
              </Button>
            )}
            {canStop && (
              <Button variant="outlined" color="warning" size="small" startIcon={<PauseRoundedIcon />}
                onClick={() => handleStop(selectedJob.id)} sx={{ borderRadius: 3 }}>
                停止
              </Button>
            )}
            {canCancel && (
              <Button variant="outlined" color="error" size="small" startIcon={<CancelRoundedIcon />}
                onClick={() => handleCancel(selectedJob.id)} sx={{ borderRadius: 3 }}>
                取消
              </Button>
            )}
            {!isRunning && (
              <Button variant="text" color="inherit" size="small" startIcon={<DeleteRoundedIcon />}
                onClick={() => handleDelete(selectedJob.id)} sx={{ borderRadius: 3, color: 'text.secondary' }}>
                刪除
              </Button>
            )}
            <Box sx={{ flex: 1 }} />
            {isRunning && <LinearProgress sx={{ width: 120, borderRadius: 1 }} />}
          </Box>
        )}

        <Divider />

        <DialogContent>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
            <Tab label="實時日誌" /><Tab label="訓練曲線" /><Tab label="輸出文件" />
          </Tabs>

          {tab === 0 && (
            <Paper ref={logRef} variant="outlined" sx={{
              p: 2, height: 440, overflow: 'auto',
              bgcolor: theme.palette.mode === 'dark' ? '#0E0D11' : '#F5F3F7',
              fontFamily: '"JetBrains Mono", monospace', fontSize: 12, lineHeight: 1.7, borderRadius: 3,
            }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: theme.palette.text.secondary }}>{logText || '等待日誌輸出...'}</pre>
            </Paper>
          )}

          {tab === 1 && (
            <Grid container spacing={2}>
              {lossKeys.length > 0 && (
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" gutterBottom>Loss 曲線</Typography>
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.1)} />
                      <XAxis dataKey="epoch" stroke={theme.palette.text.secondary} /><YAxis stroke={theme.palette.text.secondary} />
                      <RTooltip contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 12 }} />
                      <Legend />
                      {lossKeys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={CHART_COLORS[i % CHART_COLORS.length]} dot={false} strokeWidth={2} />)}
                    </LineChart>
                  </ResponsiveContainer>
                </Grid>
              )}
              {mapKeys.length > 0 && (
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" gutterBottom>mAP / Precision / Recall</Typography>
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.1)} />
                      <XAxis dataKey="epoch" stroke={theme.palette.text.secondary} /><YAxis stroke={theme.palette.text.secondary} domain={[0, 1]} />
                      <RTooltip contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 12 }} />
                      <Legend />
                      {mapKeys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={CHART_COLORS[(i + 3) % CHART_COLORS.length]} dot={false} strokeWidth={2} />)}
                    </LineChart>
                  </ResponsiveContainer>
                </Grid>
              )}
              {chartData.length === 0 && <Grid item xs={12}><Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>等待訓練數據...</Typography></Grid>}
            </Grid>
          )}

          {tab === 2 && (
            <Grid container spacing={1}>
              {artifacts.filter((a) => ['png', 'jpg'].includes(a.type)).map((a) => (
                <Grid item xs={6} md={3} key={a.relative_path}>
                  <Card sx={{ cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }}
                    onClick={() => setPreviewImg(`/api/training/jobs/${selectedJob?.id}/artifacts/${a.relative_path}`)}>
                    <Box sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <ImageRoundedIcon fontSize="small" /><Typography variant="caption" noWrap>{a.name}</Typography>
                    </Box>
                  </Card>
                </Grid>
              ))}
              {artifacts.filter((a) => a.type === 'pt').map((a) => (
                <Grid item xs={6} md={3} key={a.relative_path}>
                  <Card sx={{ p: 1.5 }}>
                    <Typography variant="caption">{a.name}</Typography>
                    <Typography variant="caption" color="text.secondary" display="block">{(a.size / 1024 / 1024).toFixed(1)} MB</Typography>
                  </Card>
                </Grid>
              ))}
              {artifacts.length === 0 && <Grid item xs={12}><Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>暫無輸出文件</Typography></Grid>}
            </Grid>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewImg} onClose={() => setPreviewImg(null)} maxWidth="lg">
        <DialogContent>{previewImg && <img src={previewImg} style={{ maxWidth: '100%', borderRadius: 12 }} alt="artifact" />}</DialogContent>
      </Dialog>

      <PreprocessDialog open={preprocessOpen} onClose={() => setPreprocessOpen(false)} onConfirm={handlePreprocessConfirm} title="訓練前預處理與增強" confirmLabel="開始訓練" />
    </Box>
  )
}
