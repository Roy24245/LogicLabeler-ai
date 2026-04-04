import { useEffect, useRef, useState } from 'react'
import {
  Box, Button, Card, CardContent, Checkbox, Chip, FormControl,
  FormControlLabel, Grid, InputLabel, MenuItem, Select, Switch, TextField, Typography,
  Alert, LinearProgress,
} from '@mui/material'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import LabelIcon from '@mui/icons-material/Label'
import { getDatasets, getSettings, runAugmentation, getAugmentationJob, type Dataset, type Settings, type AugJobStatus } from '../api/client'
import { useStore } from '../store/useStore'

const VARIATION_TYPES = [
  { id: 'angle_change', label: '視角變換', desc: '微調相機拍攝角度' },
  { id: 'lighting_bright', label: '明亮光照', desc: '模擬日間陽光充足場景' },
  { id: 'lighting_dark', label: '昏暗環境', desc: '模擬黃昏或低光照條件' },
  { id: 'weather_rain', label: '雨天效果', desc: '添加雨水效果' },
  { id: 'weather_fog', label: '霧天效果', desc: '添加輕霧效果' },
  { id: 'shadow_change', label: '陰影變化', desc: '改變光源方向和陰影強度' },
]

const STATUS_LABELS: Record<string, string> = {
  pending: '準備中',
  augmenting: '圖片增強中',
  labeling: '自動標註中',
  completed: '已完成',
  failed: '失敗',
}

export default function Augmentation() {
  const { showSnackbar } = useStore()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [selectedDs, setSelectedDs] = useState<number>(0)
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['angle_change'])
  const [running, setRunning] = useState(false)
  const [jobStatus, setJobStatus] = useState<AugJobStatus | null>(null)
  const [autoLabel, setAutoLabel] = useState(true)
  const [labelInstruction, setLabelInstruction] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const logEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const [ds, s] = await Promise.all([getDatasets(), getSettings()])
        setDatasets(ds.data)
        setSettings(s.data)
      } catch { /* empty */ }
    })()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [jobStatus?.logs?.length])

  const toggleType = (id: string) => {
    setSelectedTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    )
  }

  const startPolling = (jobId: number) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await getAugmentationJob(jobId)
        setJobStatus(data)
        if (data.status === 'completed' || data.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current)
          pollRef.current = null
          setRunning(false)
          if (data.status === 'completed') {
            let msg = `增強完成：成功生成 ${data.successfully_created} 張圖片`
            if (data.auto_label && data.total_annotations > 0) {
              msg += `，自動標註 ${data.labeled_count} 張 (${data.total_annotations} 個標註)`
            }
            showSnackbar(msg, 'success')
          } else {
            showSnackbar(`任務失敗：${data.error || '未知錯誤'}`, 'error')
          }
        }
      } catch {
        /* polling error, will retry */
      }
    }, 2000)
  }

  const handleRun = async () => {
    if (!selectedDs) { showSnackbar('請選擇數據集', 'error'); return }
    if (selectedTypes.length === 0) { showSnackbar('請至少選擇一種增強類型', 'error'); return }
    setRunning(true)
    setJobStatus(null)
    try {
      const { data } = await runAugmentation({
        dataset_id: selectedDs,
        variation_types: selectedTypes,
        auto_label: autoLabel,
        label_instruction: labelInstruction,
      })
      showSnackbar(data.message, 'info')
      startPolling(data.job_id)
    } catch (e: any) {
      showSnackbar(e?.response?.data?.detail || '增強失敗', 'error')
      setRunning(false)
    }
  }

  const isDisabled = settings && !settings.augmentation_enabled
  const progressPct = jobStatus && jobStatus.total > 0
    ? Math.round((jobStatus.processed / jobStatus.total) * 100)
    : 0

  const statusPhase = jobStatus ? (STATUS_LABELS[jobStatus.status] || jobStatus.status) : ''

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        <AutoAwesomeIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
        數據增強
      </Typography>

      {isDisabled && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          數據增強功能已關閉。請前往「系統設定」頁面開啟。
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Left: Config */}
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Typography variant="h6">增強配置</Typography>

              <FormControl fullWidth>
                <InputLabel>選擇數據集</InputLabel>
                <Select label="選擇數據集" value={selectedDs}
                  onChange={(e) => setSelectedDs(Number(e.target.value))} disabled={running}>
                  <MenuItem value={0} disabled>-- 請選擇 --</MenuItem>
                  {datasets.map((d) => (
                    <MenuItem key={d.id} value={d.id}>{d.name} ({d.image_count} 張)</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Typography variant="subtitle2">增強類型</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {VARIATION_TYPES.map((v) => (
                  <FormControlLabel
                    key={v.id}
                    control={
                      <Checkbox
                        checked={selectedTypes.includes(v.id)}
                        onChange={() => toggleType(v.id)}
                        disabled={running}
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2">{v.label}</Typography>
                        <Typography variant="caption" color="text.secondary">{v.desc}</Typography>
                      </Box>
                    }
                  />
                ))}
              </Box>

              {/* Auto-label section */}
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
                <FormControlLabel
                  control={<Switch checked={autoLabel} onChange={(e) => setAutoLabel(e.target.checked)} disabled={running} />}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <LabelIcon fontSize="small" />
                      <Typography variant="subtitle2">生成後自動標註</Typography>
                    </Box>
                  }
                />
                {autoLabel && (
                  <TextField
                    fullWidth size="small" sx={{ mt: 1.5 }}
                    label="標註指令（選填）"
                    placeholder="例如: 檢測圖片中的行人、車輛和交通號誌"
                    value={labelInstruction}
                    onChange={(e) => setLabelInstruction(e.target.value)}
                    disabled={running}
                    helperText="留空則自動使用數據集已有的類別進行檢測"
                  />
                )}
              </Box>

              <Button
                variant="contained" size="large" fullWidth
                startIcon={<PlayArrowIcon />}
                onClick={handleRun}
                disabled={running || !!isDisabled}
              >
                {running ? '任務進行中...' : '開始數據增強'}
              </Button>

              {/* Progress */}
              {running && jobStatus && (
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">
                      {statusPhase}
                      {jobStatus.status === 'augmenting' && ` ${jobStatus.processed}/${jobStatus.total}`}
                    </Typography>
                    {jobStatus.status === 'augmenting' && (
                      <Typography variant="body2" color="text.secondary">{progressPct}%</Typography>
                    )}
                  </Box>
                  <LinearProgress
                    variant={jobStatus.status === 'labeling' ? 'indeterminate' : 'determinate'}
                    value={progressPct}
                    color={jobStatus.status === 'labeling' ? 'secondary' : 'primary'}
                  />
                  <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
                    {jobStatus.successfully_created > 0 && (
                      <Chip label={`生成 ${jobStatus.successfully_created} 張`} color="success" size="small" variant="outlined" />
                    )}
                    {jobStatus.total_annotations > 0 && (
                      <Chip label={`標註 ${jobStatus.total_annotations} 個`} color="info" size="small" variant="outlined" />
                    )}
                  </Box>
                </Box>
              )}
              {running && !jobStatus && <LinearProgress />}
            </CardContent>
          </Card>
        </Grid>

        {/* Right: Logs */}
        <Grid item xs={12} md={7}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', pb: '16px !important' }}>
              <Typography variant="h6" gutterBottom>實時日誌</Typography>

              <Box
                sx={{
                  flex: 1,
                  minHeight: 400,
                  maxHeight: 600,
                  overflow: 'auto',
                  bgcolor: '#1e1e1e',
                  color: '#d4d4d4',
                  borderRadius: 1,
                  p: 1.5,
                  fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
                  fontSize: '0.8rem',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {(!jobStatus || jobStatus.logs.length === 0) ? (
                  <Typography variant="body2" sx={{ color: '#666', fontFamily: 'inherit' }}>
                    等待任務開始...
                  </Typography>
                ) : (
                  jobStatus.logs.map((line, i) => {
                    let color = '#d4d4d4'
                    if (line.includes('[ERROR]') || line.includes('✗')) color = '#f44747'
                    else if (line.includes('✓') || line.includes('成功') || line.includes('完成')) color = '#6a9955'
                    else if (line.startsWith('===')) color = '#569cd6'
                    else if (line.includes('[Commander]') || line.includes('[Soldier]') || line.includes('[Critic]')) color = '#dcdcaa'
                    else if (line.includes('[增強]')) color = '#ce9178'
                    else if (line.includes('[Review]') || line.includes('[RAG]')) color = '#c586c0'

                    return (
                      <Box key={i} component="span" sx={{ display: 'block', color }}>
                        {line}
                      </Box>
                    )
                  })
                )}
                <div ref={logEndRef} />
              </Box>

              {/* Summary after completion */}
              {jobStatus?.status === 'completed' && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  任務完成 — 生成 {jobStatus.successfully_created} 張圖片
                  {jobStatus.auto_label && jobStatus.total_annotations > 0 && (
                    <>，自動標註 {jobStatus.labeled_count} 張（共 {jobStatus.total_annotations} 個標註）</>
                  )}
                </Alert>
              )}
              {jobStatus?.status === 'failed' && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  任務失敗：{jobStatus.error || '未知錯誤'}
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
