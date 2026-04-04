import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import {
  Box, Button, Card, CardContent, FormControl, Grid, InputLabel, LinearProgress,
  MenuItem, Select, Switch, FormControlLabel, TextField, Typography, Chip,
  Divider, useTheme, alpha, Avatar,
} from '@mui/material'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded'
import RateReviewRoundedIcon from '@mui/icons-material/RateReviewRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import CancelRoundedIcon from '@mui/icons-material/CancelRounded'
import WarningRoundedIcon from '@mui/icons-material/WarningRounded'
import BuildRoundedIcon from '@mui/icons-material/BuildRounded'
import ImageRoundedIcon from '@mui/icons-material/ImageRounded'
import {
  getDatasets, runLabeling, getLabelingStatus,
  runReview, getReviewStatus, applyReviewFixes,
  type Dataset, type CurrentImagePreview,
} from '../api/client'
import { useStore } from '../store/useStore'

const BBOX_COLORS = ['#6750A4', '#0061A4', '#7D5260', '#1B8755', '#E8A317', '#B3261E', '#625B71', '#00677E', '#984061', '#006D2F']

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath()
}

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

  const [previewImage, setPreviewImage] = useState<CurrentImagePreview | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [imgLoaded, setImgLoaded] = useState(false)

  useEffect(() => { (async () => { try { const [ds] = await Promise.all([getDatasets()]); setDatasets(ds.data) } catch {} })() }, [])
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [logs])
  useEffect(() => { if (reviewLogRef.current) reviewLogRef.current.scrollTop = reviewLogRef.current.scrollHeight }, [reviewLogs])

  const classColors = useMemo(() => {
    if (!previewImage) return {}
    const m: Record<string, string> = {}
    let ci = 0
    for (const a of previewImage.annotations) {
      if (!m[a.class_name]) { m[a.class_name] = BBOX_COLORS[ci % BBOX_COLORS.length]; ci++ }
    }
    return m
  }, [previewImage])

  useEffect(() => {
    if (!previewImage) { setImgLoaded(false); return }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { imgRef.current = img; setImgLoaded(true) }
    img.onerror = () => { imgRef.current = null; setImgLoaded(false) }
    img.src = previewImage.url
    return () => { img.onload = null; img.onerror = null }
  }, [previewImage?.image_id])

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = previewContainerRef.current
    const img = imgRef.current
    if (!canvas || !container || !img || !previewImage) return

    const containerW = container.clientWidth
    const containerH = container.clientHeight || 360
    const scale = Math.min(containerW / img.naturalWidth, containerH / img.naturalHeight)
    const drawW = img.naturalWidth * scale
    const drawH = img.naturalHeight * scale
    const offsetX = (containerW - drawW) / 2
    const offsetY = (containerH - drawH) / 2

    canvas.width = containerW
    canvas.height = containerH
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, containerW, containerH)
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH)

    for (const ann of previewImage.annotations) {
      if (!ann.bbox) continue
      const bx = offsetX + ann.bbox.x * scale
      const by = offsetY + ann.bbox.y * scale
      const bw = ann.bbox.w * scale
      const bh = ann.bbox.h * scale
      const color = classColors[ann.class_name] || '#6750A4'

      const reviewStatus = (ann as any).review_status as string | undefined
      if (reviewStatus === 'rejected') {
        ctx.setLineDash([6, 4]); ctx.strokeStyle = '#B3261E'
      } else if (reviewStatus === 'needs_adjustment') {
        ctx.setLineDash([6, 4]); ctx.strokeStyle = '#E8A317'
      } else {
        ctx.setLineDash([]); ctx.strokeStyle = color
      }

      ctx.lineWidth = 2.5
      ctx.strokeRect(bx, by, bw, bh)
      ctx.setLineDash([])

      ctx.fillStyle = color
      ctx.globalAlpha = 0.08
      ctx.fillRect(bx, by, bw, bh)
      ctx.globalAlpha = 1

      const conf = ann.confidence != null ? ` ${(ann.confidence * 100).toFixed(0)}%` : ''
      const statusTag = reviewStatus === 'rejected' ? ' [rejected]' : reviewStatus === 'needs_adjustment' ? ' [adjust]' : reviewStatus === 'approved' ? ' [ok]' : ''
      const label = `${ann.class_name}${conf}${statusTag}`
      ctx.font = '12px "Google Sans", Inter, sans-serif'
      const tw = ctx.measureText(label).width
      const labelH = 20

      const labelColor = reviewStatus === 'rejected' ? '#B3261E' : reviewStatus === 'needs_adjustment' ? '#E8A317' : color
      ctx.fillStyle = labelColor
      roundRect(ctx, bx, by - labelH, tw + 10, labelH, 4)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.fillText(label, bx + 5, by - 5)
    }
  }, [previewImage, imgLoaded, classColors])

  useEffect(() => { drawCanvas() }, [drawCanvas])

  useEffect(() => {
    if (!previewContainerRef.current) return
    const ro = new ResizeObserver(() => drawCanvas())
    ro.observe(previewContainerRef.current)
    return () => ro.disconnect()
  }, [drawCanvas])

  const handleRun = async () => {
    if (!selectedDs || !instruction.trim()) { showSnackbar('請選擇數據集並輸入標註指令', 'error'); return }
    setRunning(true); setLogs([]); setPreviewImage(null)
    try {
      const { data } = await runLabeling({ dataset_id: selectedDs, instruction: instruction.trim(), soldier_mode: soldierMode, use_sahi: useSahi, use_rag: useRag })
      setProgress({ total: data.total_images, processed: 0, status: 'running' })
      pollRef.current = setInterval(async () => {
        try {
          const { data: s } = await getLabelingStatus(data.job_id)
          setProgress({ total: s.total_images, processed: s.processed_images, status: s.status })
          setLogs(s.logs || [])
          if (s.current_image) setPreviewImage(s.current_image)
          if (s.status === 'completed' || s.status === 'failed') {
            clearInterval(pollRef.current!)
            setRunning(false)
            showSnackbar(s.status === 'completed' ? '標註完成' : '標註失敗', s.status === 'completed' ? 'success' : 'error')
          }
        } catch {}
      }, 2000)
    } catch { setRunning(false); showSnackbar('啟動失敗', 'error') }
  }

  const handleReview = async () => {
    if (!reviewDs) { showSnackbar('請選擇要審查的數據集', 'error'); return }
    setReviewing(true); setReviewLogs([]); setReviewSummary(null); setPreviewImage(null)
    try {
      const { data } = await runReview({ dataset_id: reviewDs })
      setReviewJobId(data.job_id); setReviewProgress({ total: data.total_images, processed: 0, status: 'running' })
      reviewPollRef.current = setInterval(async () => {
        try {
          const { data: s } = await getReviewStatus(data.job_id)
          setReviewProgress({ total: s.total_images, processed: s.processed_images, status: s.status })
          setReviewLogs(s.logs || [])
          if (s.current_image) setPreviewImage(s.current_image)
          if (s.status === 'completed' || s.status === 'failed') {
            clearInterval(reviewPollRef.current!)
            setReviewing(false)
            setReviewSummary(s.results_summary)
            showSnackbar(s.status === 'completed' ? '審查完成' : '審查失敗', s.status === 'completed' ? 'success' : 'error')
          }
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
  const isActive = running || reviewing

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

  const totalAnns = previewImage?.annotations.length ?? 0

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Avatar sx={{ bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main', width: 44, height: 44 }}>
          <AutoFixHighRoundedIcon />
        </Avatar>
        <Typography variant="h4">自動標註</Typography>
      </Box>

      <Grid container spacing={2}>
        {/* ── Left: Config ── */}
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

        {/* ── Right: Preview + Progress + Logs ── */}
        <Grid item xs={12} md={7}>
          {/* Preview Panel */}
          <Card sx={{ mb: 2 }}>
            <CardContent sx={{ pb: '16px !important' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ImageRoundedIcon fontSize="small" color="primary" />
                  <Typography variant="h6">即時預覽</Typography>
                </Box>
                {previewImage && (
                  <Chip
                    label={`${previewImage.index} / ${running ? progress.total : reviewing ? reviewProgress.total : '—'}`}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                )}
              </Box>

              <Box
                ref={previewContainerRef}
                sx={{
                  position: 'relative',
                  width: '100%',
                  height: 360,
                  bgcolor: theme.palette.mode === 'dark' ? '#1A1A1A' : '#F0EEF2',
                  borderRadius: 3,
                  overflow: 'hidden',
                  border: `1px solid ${theme.palette.divider}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {previewImage ? (
                  <canvas
                    ref={canvasRef}
                    style={{ width: '100%', height: '100%', display: 'block' }}
                  />
                ) : (
                  <Box sx={{ textAlign: 'center', color: 'text.disabled' }}>
                    <ImageRoundedIcon sx={{ fontSize: 56, mb: 1, opacity: 0.4 }} />
                    <Typography variant="body2">
                      {isActive ? '等待處理結果...' : '啟動標註或審查後即時顯示'}
                    </Typography>
                  </Box>
                )}
              </Box>

              {previewImage && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1.5 }}>
                  <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: '60%' }}>
                    {previewImage.filename}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    <Chip
                      label={`${totalAnns} 物件`}
                      size="small"
                      sx={{
                        bgcolor: alpha(theme.palette.info.main, 0.1),
                        color: 'info.main',
                        fontWeight: 500,
                      }}
                    />
                    {Object.entries(classColors).map(([cls, clr]) => (
                      <Chip
                        key={cls}
                        label={cls}
                        size="small"
                        sx={{
                          bgcolor: alpha(clr, 0.12),
                          color: clr,
                          fontWeight: 500,
                          fontSize: 11,
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Progress */}
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

          {/* Logs */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>實時日誌</Typography>
              <Box ref={logRef} sx={{ ...logStyle, height: reviewLogs.length > 0 ? 160 : 200 }}>
                {logs.map((line, i) => <Box key={i} sx={{ color: logColor(line), whiteSpace: 'pre-wrap' }}>{line}</Box>)}
                {logs.length === 0 && <Typography variant="body2" color="text.secondary">等待執行...</Typography>}
              </Box>
              {reviewLogs.length > 0 && (
                <>
                  <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>審查日誌</Typography>
                  <Box ref={reviewLogRef} sx={{ ...logStyle, height: 160 }}>
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
