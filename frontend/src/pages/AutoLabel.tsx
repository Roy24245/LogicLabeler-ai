import { useEffect, useState, useRef } from 'react'
import {
  Box, Button, Card, CardContent, FormControl, Grid, InputLabel, LinearProgress,
  MenuItem, Select, Switch, FormControlLabel, TextField, Typography, Chip, Paper,
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import {
  getDatasets, runLabeling, getLabelingStatus, getLabelingJobs,
  type Dataset,
} from '../api/client'
import { useStore } from '../store/useStore'

export default function AutoLabel() {
  const { showSnackbar } = useStore()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [selectedDs, setSelectedDs] = useState<number>(0)
  const [instruction, setInstruction] = useState('')
  const [soldierMode, setSoldierMode] = useState('qwen_vision')
  const [useSahi, setUseSahi] = useState(false)
  const [useRag, setUseRag] = useState(true)
  const [running, setRunning] = useState(false)
  const [jobId, setJobId] = useState<number | null>(null)
  const [progress, setProgress] = useState({ total: 0, processed: 0, status: '' })
  const [logs, setLogs] = useState<string[]>([])
  const [history, setHistory] = useState<any[]>([])
  const logRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const [ds, jobs] = await Promise.all([getDatasets(), getLabelingJobs()])
        setDatasets(ds.data)
        setHistory(jobs.data)
      } catch { /* empty */ }
    })()
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  const handleRun = async () => {
    if (!selectedDs || !instruction.trim()) {
      showSnackbar('請選擇數據集並輸入標註指令', 'error')
      return
    }
    setRunning(true)
    setLogs([])
    try {
      const { data } = await runLabeling({
        dataset_id: selectedDs,
        instruction: instruction.trim(),
        soldier_mode: soldierMode,
        use_sahi: useSahi,
        use_rag: useRag,
      })
      setJobId(data.job_id)
      setProgress({ total: data.total_images, processed: 0, status: 'running' })

      pollRef.current = setInterval(async () => {
        try {
          const { data: s } = await getLabelingStatus(data.job_id)
          setProgress({ total: s.total_images, processed: s.processed_images, status: s.status })
          setLogs(s.logs || [])
          if (s.status === 'completed' || s.status === 'failed') {
            clearInterval(pollRef.current!)
            setRunning(false)
            showSnackbar(s.status === 'completed' ? '標註完成' : '標註失敗', s.status === 'completed' ? 'success' : 'error')
          }
        } catch { /* empty */ }
      }, 2000)
    } catch (e) {
      setRunning(false)
      showSnackbar('啟動失敗', 'error')
    }
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const pct = progress.total > 0 ? (progress.processed / progress.total) * 100 : 0

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        <AutoFixHighIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
        自動標註
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Typography variant="h6">標註配置</Typography>

              <FormControl fullWidth>
                <InputLabel>選擇數據集</InputLabel>
                <Select
                  label="選擇數據集" value={selectedDs}
                  onChange={(e) => setSelectedDs(Number(e.target.value))}
                >
                  <MenuItem value={0} disabled>-- 請選擇 --</MenuItem>
                  {datasets.map((d) => (
                    <MenuItem key={d.id} value={d.id}>{d.name} ({d.image_count} 張)</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="標註指令" fullWidth multiline rows={4}
                placeholder="例：標註所有未戴安全帽的工人"
                value={instruction} onChange={(e) => setInstruction(e.target.value)}
              />

              <FormControl fullWidth>
                <InputLabel>Soldier 模式</InputLabel>
                <Select
                  label="Soldier 模式" value={soldierMode}
                  onChange={(e) => setSoldierMode(e.target.value)}
                >
                  <MenuItem value="qwen_vision">Qwen3.5-Plus Vision (API)</MenuItem>
                  <MenuItem value="grounded_sam">Grounded-SAM (本地)</MenuItem>
                </Select>
              </FormControl>

              <Box>
                <FormControlLabel
                  control={<Switch checked={useSahi} onChange={(e) => setUseSahi(e.target.checked)} />}
                  label="啟用 SAHI 切片推理（高解析度圖像）"
                />
                <FormControlLabel
                  control={<Switch checked={useRag} onChange={(e) => setUseRag(e.target.checked)} />}
                  label="啟用 RAG 檢索增強"
                />
              </Box>

              <Button
                variant="contained" size="large" fullWidth
                startIcon={<PlayArrowIcon />}
                onClick={handleRun} disabled={running}
              >
                {running ? '標註進行中...' : '開始自動標註'}
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={7}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>執行進度</Typography>
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">
                    {progress.processed} / {progress.total} 張圖片
                  </Typography>
                  <Chip label={progress.status || 'idle'} size="small"
                    color={progress.status === 'completed' ? 'success' : progress.status === 'running' ? 'primary' : 'default'}
                  />
                </Box>
                <LinearProgress variant="determinate" value={pct} sx={{ height: 8, borderRadius: 4 }} />
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>實時日誌</Typography>
              <Paper
                ref={logRef}
                variant="outlined"
                sx={{
                  p: 2, height: 400, overflow: 'auto',
                  bgcolor: '#0a0a0a', fontFamily: 'monospace', fontSize: 13,
                  '&::-webkit-scrollbar': { width: 6 },
                  '&::-webkit-scrollbar-thumb': { bgcolor: '#333', borderRadius: 3 },
                }}
              >
                {logs.map((line, i) => (
                  <Box key={i} sx={{
                    color: line.includes('[ERROR]') ? '#FF6B6B' :
                      line.includes('[Commander]') ? '#7C4DFF' :
                      line.includes('[Soldier]') ? '#00E5FF' :
                      line.includes('[Critic]') ? '#69F0AE' :
                      line.includes('[RAG]') ? '#FFEAA7' : '#ccc',
                    whiteSpace: 'pre-wrap', lineHeight: 1.6,
                  }}>
                    {line}
                  </Box>
                ))}
                {logs.length === 0 && (
                  <Typography color="text.secondary">等待執行...</Typography>
                )}
              </Paper>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
