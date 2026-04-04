import { useEffect, useState } from 'react'
import {
  Box, Button, Card, CardContent, Divider, FormControl, FormControlLabel,
  Grid, InputLabel, MenuItem, Select, Switch, TextField, Typography,
  Chip, ToggleButtonGroup, ToggleButton, useTheme, alpha, Avatar,
} from '@mui/material'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import KeyRoundedIcon from '@mui/icons-material/KeyRounded'
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded'
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded'
import SettingsBrightnessRoundedIcon from '@mui/icons-material/SettingsBrightnessRounded'
import PaletteRoundedIcon from '@mui/icons-material/PaletteRounded'
import { getSettings, updateSettings, healthCheck, type Settings as SettingsType } from '../api/client'
import { useStore } from '../store/useStore'

export default function Settings() {
  const { showSnackbar, themeMode, setThemeMode } = useStore()
  const theme = useTheme()
  const [settings, setSettings] = useState<SettingsType | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [soldierMode, setSoldierMode] = useState('qwen_vision')
  const [augEnabled, setAugEnabled] = useState(true)
  const [apiStatus, setApiStatus] = useState<'ok' | 'error' | 'checking'>('checking')

  useEffect(() => {
    (async () => {
      try { const { data } = await getSettings(); setSettings(data); setSoldierMode(data.soldier_mode); setAugEnabled(data.augmentation_enabled) } catch {}
      try { await healthCheck(); setApiStatus('ok') } catch { setApiStatus('error') }
    })()
  }, [])

  const handleSave = async () => {
    try {
      const payload: Record<string, any> = { soldier_mode: soldierMode, augmentation_enabled: augEnabled }
      if (apiKey.trim()) payload.dashscope_api_key = apiKey.trim()
      await updateSettings(payload)
      showSnackbar('設定已保存', 'success')
      const { data } = await getSettings(); setSettings(data); setApiKey('')
    } catch { showSnackbar('保存失敗', 'error') }
  }

  const sectionCard = (icon: React.ReactNode, title: string, children: React.ReactNode) => (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Avatar sx={{ bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main', width: 36, height: 36 }}>
            {icon}
          </Avatar>
          <Typography variant="h6">{title}</Typography>
        </Box>
        <Divider sx={{ mb: 2 }} />
        {children}
      </CardContent>
    </Card>
  )

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Avatar sx={{ bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main', width: 44, height: 44 }}>
          <SettingsRoundedIcon />
        </Avatar>
        <Typography variant="h4">系統設定</Typography>
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          {sectionCard(<PaletteRoundedIcon fontSize="small" />, '外觀設定', (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>選擇介面主題模式</Typography>
              <ToggleButtonGroup
                value={themeMode} exclusive onChange={(_, v) => v && setThemeMode(v)}
                sx={{
                  bgcolor: alpha(theme.palette.primary.main, 0.06), borderRadius: 3,
                  '& .MuiToggleButton-root': {
                    border: 'none', borderRadius: '12px !important', px: 3, py: 1,
                    '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.16), color: 'primary.main' },
                  },
                }}
              >
                <ToggleButton value="light"><LightModeRoundedIcon sx={{ mr: 1 }} fontSize="small" />亮色</ToggleButton>
                <ToggleButton value="system"><SettingsBrightnessRoundedIcon sx={{ mr: 1 }} fontSize="small" />跟隨系統</ToggleButton>
                <ToggleButton value="dark"><DarkModeRoundedIcon sx={{ mr: 1 }} fontSize="small" />暗色</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          ))}

          {sectionCard(<KeyRoundedIcon fontSize="small" />, 'API 配置', (
            <Box>
              <TextField label="DashScope API Key" fullWidth type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder={settings?.dashscope_api_key_set ? '已設定 (輸入新值以更換)' : '請輸入 API Key'}
                helperText="阿里雲 DashScope API Key，用於 Qwen3.5-Plus 和 qwen-image-2.0-pro" sx={{ mb: 2 }} />
              {settings && (
                <Chip label={settings.dashscope_api_key_set ? 'API Key 已配置' : 'API Key 未配置'}
                  color={settings.dashscope_api_key_set ? 'success' : 'warning'} size="small" />
              )}
            </Box>
          ))}

          {sectionCard(<SmartToyRoundedIcon fontSize="small" />, 'Soldier 模式', (
            <Box>
              <FormControl fullWidth>
                <InputLabel>默認檢測模式</InputLabel>
                <Select label="默認檢測模式" value={soldierMode} onChange={(e) => setSoldierMode(e.target.value)}>
                  <MenuItem value="qwen_vision">Qwen3.5-Plus Vision API（推薦）</MenuItem>
                  <MenuItem value="grounded_sam">Grounded-SAM 本地（需 GPU）</MenuItem>
                </Select>
              </FormControl>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                Qwen Vision 透過 DashScope API 調用多模態模型；Grounded-SAM 在本地運行，精度更高但需 GPU。
              </Typography>
            </Box>
          ))}

          {sectionCard(<AutoAwesomeRoundedIcon fontSize="small" />, '數據增強', (
            <Box>
              <FormControlLabel
                control={<Switch checked={augEnabled} onChange={(e) => setAugEnabled(e.target.checked)} />}
                label="啟用數據增強功能 (AI 圖片生成)"
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                啟用後可在「數據增強」頁面使用 AI 圖片生成來擴充數據集。
              </Typography>
            </Box>
          ))}

          <Button variant="contained" size="large" startIcon={<SaveRoundedIcon />} onClick={handleSave} sx={{ borderRadius: 3 }}>
            保存設定
          </Button>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>系統狀態</Typography>
              <Divider sx={{ mb: 2 }} />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {[
                  { label: '後端 API', chip: apiStatus === 'ok' ? '正常' : apiStatus === 'checking' ? '檢查中' : '異常', color: apiStatus === 'ok' ? 'success' as const : apiStatus === 'checking' ? 'default' as const : 'error' as const },
                  { label: 'DashScope API', chip: settings?.dashscope_api_key_set ? '已配置' : '未配置', color: (settings?.dashscope_api_key_set ? 'success' : 'warning') as any },
                  { label: 'Soldier 模式', chip: soldierMode === 'qwen_vision' ? 'Qwen Vision' : 'Grounded-SAM', color: 'default' as const },
                  { label: '數據增強', chip: augEnabled ? '已啟用' : '已關閉', color: (augEnabled ? 'success' : 'default') as any },
                  { label: '主題', chip: themeMode === 'light' ? '亮色' : themeMode === 'dark' ? '暗色' : '自動', color: 'default' as const },
                ].map((row) => (
                  <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2">{row.label}</Typography>
                    <Chip label={row.chip} color={row.color} size="small" />
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>模型信息</Typography>
              <Divider sx={{ mb: 2 }} />
              {[
                ['Commander / Critic', 'Qwen3.5-Plus'],
                ['Soldier (API)', 'Qwen-VL-Plus'],
                ['增強生成', 'wanx2.0-t2i-turbo'],
                ['本地訓練', 'ultralytics YOLOv8/v11'],
              ].map(([k, v]) => (
                <Box key={k} sx={{ mb: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">{k}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{v}</Typography>
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
