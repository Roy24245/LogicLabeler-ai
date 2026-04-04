import { useEffect, useState, useRef } from 'react'
import {
  Box, Button, Card, CardContent, FormControl, Grid, InputLabel, LinearProgress,
  MenuItem, Select, Switch, FormControlLabel, TextField, Typography, Chip, Paper,
  Divider, useTheme, alpha, Avatar,
} from '@mui/material'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded'
import RateReviewRoundedIcon from '@mui/icons-material/RateReviewRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import CancelRoundedIcon from '@mui/icons-material/CancelRounded'
import WarningRoundedIcon from '@mui/icons-material/WarningRounded'
import BuildRoundedIcon from '@mui/icons-material/BuildRounded'
import {
  getDatasets, runLabeling, getLabelingStatus,
  runReview, getReviewStatus, applyReviewFixes,
  type Dataset,
} from '../api/client'
import { useStore } from '../store/useStore'

export default function AutoLabel() {
  const { showSnackbar } = useStore()
  const theme = useTheme()
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

  const [reviewDs, setReviewDs] = useState<number>(0)
  const [reviewing, setReviewing] = useState(false)
  const [reviewProgress, setReviewProgress] = useState({ total: 0, processed: 0, status: '' })
  const [reviewLogs, setReviewLogs] = useState<string[]>([])
  const [reviewSummary, setReviewSummary] = useState<{ approved: number; rejected: number; needs_adjustment: number } | null>(null)
  const [reviewJobId, setReviewJobId] = useState<number | null>(null)
  const reviewLogRef = useRef<HTMLDivElement>(null)
  const reviewPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { (async () => { try { const [ds] = await Promise.all([getDatasets()]); setDatasets(ds.data) } catch {} })() }, [])
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [logs])
  useEffect(() => { if (reviewLogRef.current) reviewLogRef.current.scrollTop = reviewLogRef.current.scrollHeight }, [reviewLogs])

  const handleRun = async () => {
    if (!selectedDs || !instruction.trim()) { showSnackbar('請選擇數據集並輸入標註指令', 'error'); return }
    setRunning(true); setLogs([])
    try {
      const { data } = await runLabeling({ dataset_id: selectedDs, instruction: instruction.trim(), soldier_mode: soldierMode, use_sahi: useSahi, use_rag: useRag })
      setProgress({ total: data.total_images, processed: 0, status: 'running' })
      pollRef.current = setInterval(async () => {
        try {
          const { data: s } = await getLabelingStatus(data.job_id)
          setProgress({ total: s.total_images, processed: s.processed_images, status: s.status })
          setLogs(s.logs || [])
          if (s.status === 'completed' || s.status === 'failed') { clearInterval(pollRef.current!); setRunning(false); showSnackbar(s.status === 'completed' ? '標註完成' : '標註失敗', s.status === 'completed' ? 'success' : 'error') }
        } catch {}
      }, 2000)
    } catch { setRunning(false); showSnackbar('啟動失敗', 'error') }
  }

  const handleReview = async () => {
    if (!reviewDs) { showSnackbar('請選擇要審查的數據集', 'error'); return }
    setReviewing(true); setReviewLogs([]); setReviewSummary(null)
    try {
      const { data } = await runReview({ dataset_id: reviewDs })
      setReviewJobId(data.job_id); setReviewProgress({ total: data.total_images, processed: 0, status: 'running' })
      reviewPollRef.current = setInterval(async () => {
        try {
          const { data: s } = await getReviewStatus(data.job_id)
          setReviewProgress({ total: s.total_images, processed: s.processed_images, status: s.status })
          setReviewLogs(s.logs || [])
          if (s.status === 'completed' || s.status === 'failed') { clearInterval(reviewPollRef.current!); setReviewing(false); setReviewSummary(s.results_summary); showSnackbar(s.status === 'completed' ? '審查完成' : '審查失敗', s.status === 'completed' ? 'success' : 'error') }
        } catch {}
      }, 2000)
    } catch { setReviewing(false); showSnackbar('啟動審查失敗', 'error') }
  }

  const handleApply = async () => {
    if (!reviewJobId) return
    try { const { data } = await applyReviewFixes(reviewJobId); showSnackbar(`已套用修正 (${data.applied} 項)`, 'success'); setReviewSummary(null); setReviewJobId(null) }
    catch { showSnackbar('套用失敗', 'error') }
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); if (reviewPollRef.current) clearInterval(reviewPollRef.current) }, [])

  const pct = progress.total > 0 ? (progress.processed / progress.total) * 100 : 0
  const reviewPct = reviewProgress.total > 0 ? (reviewProgress.processed / reviewProgress.total) * 100 : 0

  const logStyle = {
    p: 2, overflow: 'auto',
    bgcolor: theme.palette.mode === 'dark' ? '#0E0D11' : '#F5F3F7',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace', fontSize: 12, lineHeight: 1.7,
    borderRadius: 3,
    border: `1px solid ${theme.palette.divider}`,
    '&::-webkit-scrollbar': { width: 5 },
    '&::-webkit-scrollbar-thumb': { bgcolor: alpha(theme.palette.primary.main, 0.3), borderRadius: 3 },
  }

  const logColor = (line: string) => {
    if (line.includes('[ERROR]')) return theme.palette.error.main
    if (line.includes('[Commander]')) return theme.palette.primary.main
    if (line.includes('[Soldier]')) return theme.palette.info.main
    if (line.includes('[Critic]')) return theme.palette.success.main
    if (line.includes('[RAG]')) return theme.palette.warning.main
    if (line.includes('✓')) return theme.palette.success.main
    if (line.includes('✗')) return theme.palette.error.main
    if (line.includes('⚠')) return theme.palette.warning.main
    if (line.includes('[Review]')) return theme.palette.secondary.main
    return theme.palette.text.secondary
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Avatar sx={{ bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main', width: 44, height: 44 }}>
          <AutoFixHighRoundedIcon />
        </Avatar>
        <Typography variant="h4">自動標註</Typography>
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={12} md={5}>
          <Card sx={{ mb: 2 }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="h6">標註配置</Typography>
              <FormControl fullWidth>
                <InputLabel>選擇數據集</InputLabel>
                <Select label="選擇數據集" value={selectedDs} onChange={(e) => setSelectedDs(Number(e.target.value))}>
                  <MenuItem value={0} disabled>-- 請選擇 --</MenuItem>
                  {datasets.map((d) => <MenuItem key={d.id} value={d.id}>{d.name} ({d.image_count} 張)</MenuItem>)}
                </Select>
              </FormControl>
              <TextField label="標註指令" fullWidth multiline rows={3} placeholder="例：標註所有未戴安全帽的工人" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
              <FormControl fullWidth>
                <InputLabel>Soldier 模式</InputLabel>
                <Select label="Soldier 模式" value={soldierMode} onChange={(e) => setSoldierMode(e.target.value)}>
                  <MenuItem value="qwen_vision">Qwen3.5-Plus Vision (API)</MenuItem>
                  <MenuItem value="grounded_sam">Grounded-SAM (本地)</MenuItem>
                </Select>
              </FormControl>
              <Box>
                <FormControlLabel control={<Switch checked={useSahi} onChange={(e) => setUseSahi(e.target.checked)} />} label="SAHI 切片推理" />
                <FormControlLabel control={<Switch checked={useRag} onChange={(e) => setUseRag(e.target.checked)} />} label="RAG 檢索增強" />
              </Box>
              <Button variant="contained" size="large" fullWidth startIcon={<PlayArrowRoundedIcon />} onClick={handleRun} disabled={running} sx={{ borderRadius: 3 }}>
                {running ? '標註進行中...' : '開始自動標註'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <RateReviewRoundedIcon color="secondary" />
                <Typography variant="h6">AI 審查</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">對已有標註進行 AI 二次驗證</Typography>
              <FormControl fullWidth>
                <InputLabel>選擇數據集</InputLabel>
                <Select label="選擇數據集" value={reviewDs} onChange={(e) => setReviewDs(Number(e.target.value))}>
                  <MenuItem value={0} disabled>-- 請選擇 --</MenuItem>
                  {datasets.filter(d => d.annotation_count > 0).map((d) => <MenuItem key={d.id} value={d.id}>{d.name} ({d.annotation_count} 標註)</MenuItem>)}
                </Select>
              </FormControl>
              <Button variant="outlined" size="large" fullWidth startIcon={<RateReviewRoundedIcon />} onClick={handleReview} disabled={reviewing || !reviewDs} sx={{ borderRadius: 3 }}>
                {reviewing ? '審查進行中...' : '開始 AI 審查'}
              </Button>
              {reviewSummary && (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Chip icon={<CheckCircleRoundedIcon />} label={`通過 ${reviewSummary.approved}`} color="success" variant="outlined" />
                  <Chip icon={<WarningRoundedIcon />} label={`調整 ${reviewSummary.needs_adjustment}`} color="warning" variant="outlined" />
                  <Chip icon={<CancelRoundedIcon />} label={`拒絕 ${reviewSummary.rejected}`} color="error" variant="outlined" />
                </Box>
              )}
              {reviewSummary && (reviewSummary.rejected > 0 || reviewSummary.needs_adjustment > 0) && (
                <Button variant="contained" color="warning" startIcon={<BuildRoundedIcon />} onClick={handleApply} fullWidth sx={{ borderRadius: 3 }}>
                  一鍵套用修正
                </Button>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={7}>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>標註進度</Typography>
              <Box sx={{ mb: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">{progress.processed} / {progress.total} 張圖片</Typography>
                  <Chip label={progress.status || 'idle'} size="small" color={progress.status === 'completed' ? 'success' : progress.status === 'running' ? 'primary' : 'default'} />
                </Box>
                <LinearProgress variant="determinate" value={pct} />
              </Box>
              {(reviewing || reviewProgress.status) && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" gutterBottom>審查進度</Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">{reviewProgress.processed} / {reviewProgress.total}</Typography>
                    <Chip label={reviewProgress.status || 'idle'} size="small" color={reviewProgress.status === 'completed' ? 'success' : reviewProgress.status === 'running' ? 'info' : 'default'} />
                  </Box>
                  <LinearProgress variant="determinate" value={reviewPct} color="info" />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>實時日誌</Typography>
              <Box ref={logRef} sx={{ ...logStyle, height: reviewLogs.length > 0 ? 200 : 380 }}>
                {logs.map((line, i) => <Box key={i} sx={{ color: logColor(line), whiteSpace: 'pre-wrap' }}>{line}</Box>)}
                {logs.length === 0 && <Typography variant="body2" color="text.secondary">等待執行...</Typography>}
              </Box>
              {reviewLogs.length > 0 && (
                <>
                  <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>審查日誌</Typography>
                  <Box ref={reviewLogRef} sx={{ ...logStyle, height: 200 }}>
                    {reviewLogs.map((line, i) => <Box key={i} sx={{ color: logColor(line), whiteSpace: 'pre-wrap' }}>{line}</Box>)}
                  </Box>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
