import { useEffect, useState } from 'react'
import {
  Box, Button, Card, CardContent, Divider, FormControl, FormControlLabel,
  Grid, InputLabel, MenuItem, Select, Switch, TextField, Typography, Alert,
  Chip,
} from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import KeyIcon from '@mui/icons-material/Key'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import { getSettings, updateSettings, healthCheck, type Settings as SettingsType } from '../api/client'
import { useStore } from '../store/useStore'

export default function Settings() {
  const { showSnackbar } = useStore()
  const [settings, setSettings] = useState<SettingsType | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [soldierMode, setSoldierMode] = useState('qwen_vision')
  const [augEnabled, setAugEnabled] = useState(true)
  const [apiStatus, setApiStatus] = useState<'ok' | 'error' | 'checking'>('checking')

  useEffect(() => {
    (async () => {
      try {
        const { data } = await getSettings()
        setSettings(data)
        setSoldierMode(data.soldier_mode)
        setAugEnabled(data.augmentation_enabled)
      } catch { /* empty */ }

      try {
        await healthCheck()
        setApiStatus('ok')
      } catch {
        setApiStatus('error')
      }
    })()
  }, [])

  const handleSave = async () => {
    try {
      const payload: Record<string, any> = {
        soldier_mode: soldierMode,
        augmentation_enabled: augEnabled,
      }
      if (apiKey.trim()) payload.dashscope_api_key = apiKey.trim()
      await updateSettings(payload)
      showSnackbar('設定已保存', 'success')
      const { data } = await getSettings()
      setSettings(data)
      setApiKey('')
    } catch {
      showSnackbar('保存失敗', 'error')
    }
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>系統設定</Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          {/* API Key */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <KeyIcon color="primary" />
                <Typography variant="h6">API 配置</Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              <TextField
                label="DashScope API Key"
                fullWidth
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={settings?.dashscope_api_key_set ? '已設定 (輸入新值以更換)' : '請輸入 API Key'}
                helperText="阿里雲 DashScope API Key，用於 Qwen3.5-Plus 和 qwen-image-2.0-pro"
                sx={{ mb: 2 }}
              />
              {settings && (
                <Chip
                  label={settings.dashscope_api_key_set ? 'API Key 已配置' : 'API Key 未配置'}
                  color={settings.dashscope_api_key_set ? 'success' : 'warning'}
                  size="small"
                />
              )}
            </CardContent>
          </Card>

          {/* Soldier Mode */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <SmartToyIcon color="primary" />
                <Typography variant="h6">Soldier 模式</Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              <FormControl fullWidth>
                <InputLabel>默認檢測模式</InputLabel>
                <Select label="默認檢測模式" value={soldierMode} onChange={(e) => setSoldierMode(e.target.value)}>
                  <MenuItem value="qwen_vision">
                    Qwen3.5-Plus Vision API（推薦 — 純 API 方案，無需 GPU）
                  </MenuItem>
                  <MenuItem value="grounded_sam">
                    Grounded-SAM 本地（需要 GPU 及模型權重）
                  </MenuItem>
                </Select>
              </FormControl>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Qwen Vision 模式透過 DashScope API 調用多模態模型進行目標檢測；
                Grounded-SAM 模式在本地運行 Grounding DINO + SAM，精度更高但需要 GPU。
              </Typography>
            </CardContent>
          </Card>

          {/* Augmentation Toggle */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <AutoAwesomeIcon color="primary" />
                <Typography variant="h6">數據增強</Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              <FormControlLabel
                control={<Switch checked={augEnabled} onChange={(e) => setAugEnabled(e.target.checked)} />}
                label="啟用數據增強功能 (qwen-image-2.0-pro 圖片生成)"
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                啟用後可在「數據增強」頁面使用 AI 圖片生成來擴充數據集。
                關閉後數據增強功能將不可用。
              </Typography>
            </CardContent>
          </Card>

          <Button variant="contained" size="large" startIcon={<SaveIcon />} onClick={handleSave}>
            保存設定
          </Button>
        </Grid>

        {/* Status */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>系統狀態</Typography>
              <Divider sx={{ mb: 2 }} />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">後端 API</Typography>
                  <Chip label={apiStatus === 'ok' ? '正常' : apiStatus === 'checking' ? '檢查中' : '異常'}
                    color={apiStatus === 'ok' ? 'success' : apiStatus === 'checking' ? 'default' : 'error'}
                    size="small" />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">DashScope API</Typography>
                  <Chip label={settings?.dashscope_api_key_set ? '已配置' : '未配置'}
                    color={settings?.dashscope_api_key_set ? 'success' : 'warning'} size="small" />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">Soldier 模式</Typography>
                  <Chip label={soldierMode === 'qwen_vision' ? 'Qwen Vision' : 'Grounded-SAM'}
                    variant="outlined" size="small" />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">數據增強</Typography>
                  <Chip label={augEnabled ? '已啟用' : '已關閉'}
                    color={augEnabled ? 'success' : 'default'} size="small" />
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>模型信息</Typography>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="body2" paragraph>
                <strong>Commander / Critic:</strong><br />Qwen3.5-Plus (qwen-plus)
              </Typography>
              <Typography variant="body2" paragraph>
                <strong>Soldier (API 模式):</strong><br />Qwen-VL-Plus (多模態)
              </Typography>
              <Typography variant="body2" paragraph>
                <strong>增強生成:</strong><br />wanx2.0-t2i-turbo
              </Typography>
              <Typography variant="body2">
                <strong>本地訓練:</strong><br />ultralytics YOLOv8/v11
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
