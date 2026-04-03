import { useEffect, useState, useRef } from 'react'
import {
  Box, Button, Card, CardContent, FormControl, Grid, InputLabel, LinearProgress,
  MenuItem, Select, Switch, FormControlLabel, TextField, Typography, Chip, Paper, Divider,
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import RateReviewIcon from '@mui/icons-material/RateReview'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import WarningIcon from '@mui/icons-material/Warning'
import AutoFixOffIcon from '@mui/icons-material/AutoFixOff'
import {
  getDatasets, runLabeling, getLabelingStatus, getLabelingJobs,
  runReview, getReviewStatus, applyReviewFixes,
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
  const [progress, setProgress] = useState({ total: 0, processed: 0, status: '' })
  const [logs, setLogs] = useState<string[]>([])
  const logRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Review state
  const [reviewDs, setReviewDs] = useState<number>(0)
  const [reviewing, setReviewing] = useState(false)
  const [reviewProgress, setReviewProgress] = useState({ total: 0, processed: 0, status: '' })
  const [reviewLogs, setReviewLogs] = useState<string[]>([])
  const [reviewSummary, setReviewSummary] = useState<{ approved: number; rejected: number; needs_adjustment: number } | null>(null)
  const [reviewJobId, setReviewJobId] = useState<number | null>(null)
  const reviewLogRef = useRef<HTMLDivElement>(null)
  const reviewPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const [ds] = await Promise.all([getDatasets()])
        setDatasets(ds.data)
      } catch { /* empty */ }
    })()
  }, [])

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [logs])
  useEffect(() => { if (reviewLogRef.current) reviewLogRef.current.scrollTop = reviewLogRef.current.scrollHeight }, [reviewLogs])

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
    } catch {
      setRunning(false)
      showSnackbar('啟動失敗', 'error')
    }
  }

  // Review handlers
  const handleReview = async () => {
    if (!reviewDs) {
      showSnackbar('請選擇要審查的數據集', 'error')
      return
    }
    setReviewing(true)
    setReviewLogs([])
    setReviewSummary(null)
    try {
      const { data } = await runReview({ dataset_id: reviewDs })
      setReviewJobId(data.job_id)
      setReviewProgress({ total: data.total_images, processed: 0, status: 'running' })
      reviewPollRef.current = setInterval(async () => {
        try {
          const { data: s } = await getReviewStatus(data.job_id)
          setReviewProgress({ total: s.total_images, processed: s.processed_images, status: s.status })
          setReviewLogs(s.logs || [])
          if (s.status === 'completed' || s.status === 'failed') {
            clearInterval(reviewPollRef.current!)
            setReviewing(false)
            setReviewSummary(s.results_summary)
            showSnackbar(s.status === 'completed' ? '審查完成' : '審查失敗', s.status === 'completed' ? 'success' : 'error')
          }
        } catch { /* empty */ }
      }, 2000)
    } catch {
      setReviewing(false)
      showSnackbar('啟動審查失敗', 'error')
    }
  }

  const handleApply = async () => {
    if (!reviewJobId) return
    try {
      const { data } = await applyReviewFixes(reviewJobId)
      showSnackbar(`已套用修正 (${data.applied} 項)`, 'success')
      setReviewSummary(null)
      setReviewJobId(null)
    } catch {
      showSnackbar('套用失敗', 'error')
    }
  }

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (reviewPollRef.current) clearInterval(reviewPollRef.current)
  }, [])

  const pct = progress.total > 0 ? (progress.processed / progress.total) * 100 : 0
  const reviewPct = reviewProgress.total > 0 ? (reviewProgress.processed / reviewProgress.total) * 100 : 0

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        <AutoFixHighIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
        自動標註
      </Typography>

      <Grid container spacing={3}>
        {/* Left column: config */}
        <Grid item xs={12} md={5}>
          <Card sx={{ mb: 3 }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Typography variant="h6">標註配置</Typography>
              <FormControl fullWidth>
                <InputLabel>選擇數據集</InputLabel>
                <Select label="選擇數據集" value={selectedDs} onChange={(e) => setSelectedDs(Number(e.target.value))}>
                  <MenuItem value={0} disabled>-- 請選擇 --</MenuItem>
                  {datasets.map((d) => (
                    <MenuItem key={d.id} value={d.id}>{d.name} ({d.image_count} 張)</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField label="標註指令" fullWidth multiline rows={4} placeholder="例：標註所有未戴安全帽的工人" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
              <FormControl fullWidth>
                <InputLabel>Soldier 模式</InputLabel>
                <Select label="Soldier 模式" value={soldierMode} onChange={(e) => setSoldierMode(e.target.value)}>
                  <MenuItem value="qwen_vision">Qwen3.5-Plus Vision (API)</MenuItem>
                  <MenuItem value="grounded_sam">Grounded-SAM (本地)</MenuItem>
                </Select>
              </FormControl>
              <Box>
                <FormControlLabel control={<Switch checked={useSahi} onChange={(e) => setUseSahi(e.target.checked)} />} label="啟用 SAHI 切片推理（高解析度圖像）" />
                <FormControlLabel control={<Switch checked={useRag} onChange={(e) => setUseRag(e.target.checked)} />} label="啟用 RAG 檢索增強" />
              </Box>
              <Button variant="contained" size="large" fullWidth startIcon={<PlayArrowIcon />} onClick={handleRun} disabled={running}>
                {running ? '標註進行中...' : '開始自動標註'}
              </Button>
            </CardContent>
          </Card>

          {/* AI Review Panel */}
          <Card>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="h6">
                <RateReviewIcon sx={{ verticalAlign: 'middle', mr: 1, fontSize: 22 }} />
                AI 審查
              </Typography>
              <Typography variant="body2" color="text.secondary">
                對已有標註進行 AI 二次驗證，檢查分類是否正確、檢測框是否準確
              </Typography>
              <FormControl fullWidth>
                <InputLabel>選擇數據集</InputLabel>
                <Select label="選擇數據集" value={reviewDs} onChange={(e) => setReviewDs(Number(e.target.value))}>
                  <MenuItem value={0} disabled>-- 請選擇 --</MenuItem>
                  {datasets.filter(d => d.annotation_count > 0).map((d) => (
                    <MenuItem key={d.id} value={d.id}>{d.name} ({d.annotation_count} 標註)</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button variant="outlined" size="large" fullWidth startIcon={<RateReviewIcon />} onClick={handleReview} disabled={reviewing || !reviewDs}>
                {reviewing ? '審查進行中...' : '開始 AI 審查'}
              </Button>

              {/* Review summary */}
              {reviewSummary && (
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 1 }}>
                  <Chip icon={<CheckCircleIcon />} label={`通過 ${reviewSummary.approved}`} color="success" variant="outlined" />
                  <Chip icon={<WarningIcon />} label={`需調整 ${reviewSummary.needs_adjustment}`} color="warning" variant="outlined" />
                  <Chip icon={<CancelIcon />} label={`拒絕 ${reviewSummary.rejected}`} color="error" variant="outlined" />
                </Box>
              )}
              {reviewSummary && (reviewSummary.rejected > 0 || reviewSummary.needs_adjustment > 0) && (
                <Button variant="contained" color="warning" startIcon={<AutoFixOffIcon />} onClick={handleApply} fullWidth>
                  一鍵套用修正（刪除拒絕 + 修正類別）
                </Button>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Right column: progress + logs */}
        <Grid item xs={12} md={7}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>標註進度</Typography>
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">{progress.processed} / {progress.total} 張圖片</Typography>
                  <Chip label={progress.status || 'idle'} size="small" color={progress.status === 'completed' ? 'success' : progress.status === 'running' ? 'primary' : 'default'} />
                </Box>
                <LinearProgress variant="determinate" value={pct} sx={{ height: 8, borderRadius: 4 }} />
              </Box>
              {(reviewing || reviewProgress.status) && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" gutterBottom>審查進度</Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2">{reviewProgress.processed} / {reviewProgress.total} 張圖片</Typography>
                    <Chip label={reviewProgress.status || 'idle'} size="small" color={reviewProgress.status === 'completed' ? 'success' : reviewProgress.status === 'running' ? 'info' : 'default'} />
                  </Box>
                  <LinearProgress variant="determinate" value={reviewPct} sx={{ height: 8, borderRadius: 4 }} color="info" />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>實時日誌</Typography>
              <Paper
                ref={logRef}
                variant="outlined"
                sx={{
                  p: 2, height: reviewLogs.length > 0 ? 200 : 400, overflow: 'auto',
                  bgcolor: '#0a0a0a', fontFamily: 'monospace', fontSize: 13,
                  '&::-webkit-scrollbar': { width: 6 },
                  '&::-webkit-scrollbar-thumb': { bgcolor: '#333', borderRadius: 3 },
                }}
              >
                {logs.map((line, i) => (
                  <Box key={i} sx={{
                    color: line.includes('[ERROR]') ? '#FF6B6B' : line.includes('[Commander]') ? '#7C4DFF' :
                      line.includes('[Soldier]') ? '#00E5FF' : line.includes('[Critic]') ? '#69F0AE' :
                      line.includes('[RAG]') ? '#FFEAA7' : '#ccc',
                    whiteSpace: 'pre-wrap', lineHeight: 1.6,
                  }}>{line}</Box>
                ))}
                {logs.length === 0 && <Typography color="text.secondary">等待執行...</Typography>}
              </Paper>

              {reviewLogs.length > 0 && (
                <>
                  <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>審查日誌</Typography>
                  <Paper
                    ref={reviewLogRef}
                    variant="outlined"
                    sx={{
                      p: 2, height: 200, overflow: 'auto',
                      bgcolor: '#0a0a0a', fontFamily: 'monospace', fontSize: 13,
                      '&::-webkit-scrollbar': { width: 6 },
                      '&::-webkit-scrollbar-thumb': { bgcolor: '#333', borderRadius: 3 },
                    }}
                  >
                    {reviewLogs.map((line, i) => (
                      <Box key={i} sx={{
                        color: line.includes('[ERROR]') ? '#FF6B6B' : line.includes('✓') ? '#69F0AE' :
                          line.includes('✗') ? '#FF6B6B' : line.includes('⚠') ? '#FFD54F' :
                          line.includes('[Review]') ? '#CE93D8' : '#ccc',
                        whiteSpace: 'pre-wrap', lineHeight: 1.6,
                      }}>{line}</Box>
                    ))}
                  </Paper>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
