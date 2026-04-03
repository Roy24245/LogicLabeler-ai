import { useEffect, useState } from 'react'
import {
  Box, Button, Card, CardContent, Checkbox, Chip, FormControl,
  FormControlLabel, Grid, InputLabel, MenuItem, Select, Typography,
  Alert, LinearProgress,
} from '@mui/material'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { getDatasets, getSettings, runAugmentation, type Dataset, type Settings } from '../api/client'
import { useStore } from '../store/useStore'

const VARIATION_TYPES = [
  { id: 'angle_change', label: '視角變換', desc: '微調相機拍攝角度' },
  { id: 'lighting_bright', label: '明亮光照', desc: '模擬日間陽光充足場景' },
  { id: 'lighting_dark', label: '昏暗環境', desc: '模擬黃昏或低光照條件' },
  { id: 'weather_rain', label: '雨天效果', desc: '添加雨水效果' },
  { id: 'weather_fog', label: '霧天效果', desc: '添加輕霧效果' },
  { id: 'shadow_change', label: '陰影變化', desc: '改變光源方向和陰影強度' },
]

export default function Augmentation() {
  const { showSnackbar } = useStore()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [selectedDs, setSelectedDs] = useState<number>(0)
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['angle_change'])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    (async () => {
      try {
        const [ds, s] = await Promise.all([getDatasets(), getSettings()])
        setDatasets(ds.data)
        setSettings(s.data)
      } catch { /* empty */ }
    })()
  }, [])

  const toggleType = (id: string) => {
    setSelectedTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    )
  }

  const handleRun = async () => {
    if (!selectedDs) { showSnackbar('請選擇數據集', 'error'); return }
    if (selectedTypes.length === 0) { showSnackbar('請至少選擇一種增強類型', 'error'); return }
    setRunning(true)
    setProgress(0)
    try {
      const { data } = await runAugmentation({
        dataset_id: selectedDs,
        variation_types: selectedTypes,
      })
      showSnackbar(`增強完成：成功生成 ${data.successfully_created} 張圖片`, 'success')
    } catch (e: any) {
      showSnackbar(e?.response?.data?.detail || '增強失敗', 'error')
    }
    setRunning(false)
  }

  const isDisabled = settings && !settings.augmentation_enabled

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
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Typography variant="h6">增強配置</Typography>

              <FormControl fullWidth>
                <InputLabel>選擇數據集</InputLabel>
                <Select label="選擇數據集" value={selectedDs}
                  onChange={(e) => setSelectedDs(Number(e.target.value))}>
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

              <Button
                variant="contained" size="large" fullWidth
                startIcon={<PlayArrowIcon />}
                onClick={handleRun}
                disabled={running || !!isDisabled}
              >
                {running ? '增強進行中...' : '開始數據增強'}
              </Button>

              {running && <LinearProgress />}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>增強說明</Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                數據增強功能使用 qwen-image-2.0-pro 圖像生成模型，以現有數據集中的圖片為基底，
                通過條件化變換生成多樣化的訓練樣本。
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                變換嚴格遵循「只修改非核心語義屬性」的原則，保留所有目標物體的類型、位置和大小，
                僅調整拍攝角度、光照條件、天氣狀況等環境因素。
              </Typography>
              <Typography variant="subtitle2" sx={{ mt: 2 }}>支持的變換維度：</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                {VARIATION_TYPES.map((v) => (
                  <Chip key={v.id} label={v.label} variant="outlined" size="small" />
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
