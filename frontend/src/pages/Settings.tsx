import { useEffect, useMemo, useState } from 'react'
import {
  Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControl, FormControlLabel, Grid, IconButton,
  InputLabel, List, ListItem, ListItemText, MenuItem, Select, Stack, Switch,
  TextField, Typography, Chip, ToggleButtonGroup, ToggleButton, Tooltip,
  useTheme, alpha,
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
import HubRoundedIcon from '@mui/icons-material/HubRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded'
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded'
import {
  getSettings, updateSettings, healthCheck, getProviders, createProvider,
  updateProvider, deleteProvider, setActiveModel,
  type Settings as SettingsType, type ModelProvider,
} from '../api/client'
import { useStore } from '../store/useStore'
import PageHeader from '../components/PageHeader'
import SectionCard from '../components/SectionCard'

type ProviderType = 'openai' | 'anthropic'

interface ProviderForm {
  id?: string
  name: string
  type: ProviderType
  api_key: string
  base_url: string
  models: string  // comma-separated for the form
}

const EMPTY_FORM: ProviderForm = {
  name: '',
  type: 'openai',
  api_key: '',
  base_url: '',
  models: '',
}

const PROVIDER_PRESETS: Record<ProviderType, { base_url: string; models: string; hint: string }> = {
  openai: {
    base_url: 'https://api.openai.com/v1',
    models: 'gpt-4o, gpt-4o-mini, gpt-4-turbo',
    hint: '相容於 OpenAI / OpenRouter / DeepSeek / vLLM / Ollama 等所有 OpenAI 格式 API',
  },
  anthropic: {
    base_url: 'https://api.anthropic.com',
    models: 'claude-sonnet-4-5, claude-opus-4-5, claude-3-5-haiku-latest',
    hint: 'Anthropic Claude 官方 API（支援文字 + 視覺）',
  },
}

export default function Settings() {
  const { showSnackbar, themeMode, setThemeMode, setOnboardingCompleted } = useStore()
  const theme = useTheme()
  const [settings, setSettings] = useState<SettingsType | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [soldierMode, setSoldierMode] = useState('qwen_vision')
  const [augEnabled, setAugEnabled] = useState(true)
  const [apiStatus, setApiStatus] = useState<'ok' | 'error' | 'checking'>('checking')

  const [providers, setProviders] = useState<ModelProvider[]>([])
  const [textModel, setTextModel] = useState<{ provider_id: string; model: string }>({ provider_id: 'builtin_dashscope', model: 'qwen-plus' })
  const [visionModel, setVisionModel] = useState<{ provider_id: string; model: string }>({ provider_id: 'builtin_dashscope', model: 'qwen-vl-plus' })
  const [soldierModel, setSoldierModel] = useState<{ provider_id: string; model: string }>({ provider_id: 'builtin_dashscope', model: 'qwen-vl-plus' })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM)
  const [editing, setEditing] = useState<ModelProvider | null>(null)

  const reload = async () => {
    try {
      const [{ data: s }, { data: ps }] = await Promise.all([getSettings(), getProviders()])
      setSettings(s); setSoldierMode(s.soldier_mode); setAugEnabled(s.augmentation_enabled)
      setProviders(ps)
      if (s.active_text_model) setTextModel(s.active_text_model)
      if (s.active_vision_model) setVisionModel(s.active_vision_model)
      if (s.active_soldier_model) setSoldierModel(s.active_soldier_model)
      else if (s.active_vision_model) setSoldierModel(s.active_vision_model)
    } catch {}
  }

  useEffect(() => {
    reload()
    healthCheck().then(() => setApiStatus('ok')).catch(() => setApiStatus('error'))
  }, [])

  const handleSave = async () => {
    try {
      const payload: Record<string, any> = { soldier_mode: soldierMode, augmentation_enabled: augEnabled }
      if (apiKey.trim()) payload.dashscope_api_key = apiKey.trim()
      await updateSettings(payload)
      showSnackbar('設定已保存', 'success')
      setApiKey('')
      reload()
    } catch { showSnackbar('保存失敗', 'error') }
  }

  const handleActiveModel = async (role: 'text' | 'vision' | 'soldier', provider_id: string, model: string) => {
    try {
      await setActiveModel({ role, provider_id, model })
      if (role === 'text') setTextModel({ provider_id, model })
      else if (role === 'vision') setVisionModel({ provider_id, model })
      else setSoldierModel({ provider_id, model })
      showSnackbar(
        `已切換${role === 'text' ? '文字' : role === 'vision' ? '視覺' : 'Soldier'}模型`,
        'success',
      )
    } catch { showSnackbar('切換失敗', 'error') }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, base_url: PROVIDER_PRESETS.openai.base_url, models: PROVIDER_PRESETS.openai.models })
    setDialogOpen(true)
  }
  const openEdit = (p: ModelProvider) => {
    setEditing(p)
    setForm({
      id: p.id, name: p.name, type: p.type as ProviderType,
      api_key: '', base_url: p.base_url || '', models: (p.models || []).join(', '),
    })
    setDialogOpen(true)
  }
  const handleSubmitProvider = async () => {
    const models = form.models.split(',').map(s => s.trim()).filter(Boolean)
    try {
      if (editing) {
        const payload: any = { name: form.name, base_url: form.base_url, models }
        if (form.api_key.trim()) payload.api_key = form.api_key.trim()
        await updateProvider(editing.id, payload)
        showSnackbar('供應商已更新', 'success')
      } else {
        if (!form.name.trim() || !form.api_key.trim()) {
          showSnackbar('名稱與 API Key 為必填', 'error'); return
        }
        await createProvider({
          name: form.name.trim(),
          type: form.type,
          api_key: form.api_key.trim(),
          base_url: form.base_url.trim(),
          models,
        })
        showSnackbar('供應商已新增', 'success')
      }
      setDialogOpen(false)
      reload()
    } catch (e: any) { showSnackbar(e?.response?.data?.detail || '儲存失敗', 'error') }
  }
  const handleDeleteProvider = async (id: string) => {
    if (!confirm('確定要刪除這個供應商嗎？')) return
    try { await deleteProvider(id); showSnackbar('已刪除', 'success'); reload() }
    catch { showSnackbar('刪除失敗', 'error') }
  }

  const providerOf = (id: string): ModelProvider | undefined =>
    providers.find(p => p.id === id) || providers[0]

  const textProvider = providerOf(textModel.provider_id)
  const visionProvider = providerOf(visionModel.provider_id)
  const soldierProvider = providerOf(soldierModel.provider_id)

  const typePreset = useMemo(() => PROVIDER_PRESETS[form.type], [form.type])

  return (
    <Box>
      <PageHeader
        icon={<SettingsRoundedIcon />}
        title="系統設定"
        subtitle="管理外觀、API、模型供應商與系統行為"
        actions={
          <Button
            variant="outlined"
            startIcon={<RestartAltRoundedIcon />}
            onClick={() => setOnboardingCompleted(false)}
          >
            重新執行初始化
          </Button>
        }
      />

      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <SectionCard icon={<PaletteRoundedIcon fontSize="small" />} title="外觀設定">
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>選擇介面主題模式</Typography>
            <ToggleButtonGroup
              value={themeMode} exclusive onChange={(_, v) => v && setThemeMode(v)}
            >
              <ToggleButton value="light" sx={{ px: 2.5 }}><LightModeRoundedIcon sx={{ mr: 1 }} fontSize="small" />亮色</ToggleButton>
              <ToggleButton value="system" sx={{ px: 2.5 }}><SettingsBrightnessRoundedIcon sx={{ mr: 1 }} fontSize="small" />跟隨系統</ToggleButton>
              <ToggleButton value="dark" sx={{ px: 2.5 }}><DarkModeRoundedIcon sx={{ mr: 1 }} fontSize="small" />暗色</ToggleButton>
            </ToggleButtonGroup>
          </SectionCard>

          <SectionCard icon={<KeyRoundedIcon fontSize="small" />} title="API 配置">
            <TextField label="DashScope API Key" fullWidth type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
              placeholder={settings?.dashscope_api_key_set ? '已設定 (輸入新值以更換)' : '請輸入 API Key'}
              helperText="阿里雲 DashScope API Key，內建 DashScope 供應商使用" sx={{ mb: 2 }} />
            {settings && (
              <Chip label={settings.dashscope_api_key_set ? 'API Key 已配置' : 'API Key 未配置'}
                color={settings.dashscope_api_key_set ? 'success' : 'warning'} size="small" />
            )}
          </SectionCard>

          <SectionCard
            icon={<HubRoundedIcon fontSize="small" />}
            title="模型供應商"
            action={
              <Button size="small" variant="tonal" startIcon={<AddRoundedIcon />} onClick={openCreate}>
                新增供應商
              </Button>
            }
          >
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  除內建 DashScope 外，可新增自訂 OpenAI 相容或 Anthropic 供應商，並選擇用於文字／視覺任務的預設模型。
                </Typography>

                <List sx={{ bgcolor: alpha(theme.palette.primary.main, 0.04), borderRadius: 3, mb: 2, py: 0.5 }}>
                  {providers.map((p) => (
                    <ListItem
                      key={p.id}
                      sx={{
                        borderRadius: 2,
                        mb: 0.5,
                        bgcolor: p.builtin ? alpha(theme.palette.success.main, 0.06) : 'transparent',
                      }}
                      secondaryAction={
                        !p.builtin ? (
                          <Stack direction="row" spacing={0.5}>
                            <Tooltip title="編輯"><IconButton size="small" onClick={() => openEdit(p)}><EditRoundedIcon fontSize="small" /></IconButton></Tooltip>
                            <Tooltip title="刪除"><IconButton size="small" onClick={() => handleDeleteProvider(p.id)}><DeleteRoundedIcon fontSize="small" /></IconButton></Tooltip>
                          </Stack>
                        ) : (
                          <Chip label="內建" size="small" color="success" variant="outlined" />
                        )
                      }
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.name}</Typography>
                            <Chip
                              label={p.type === 'dashscope' ? 'DashScope' : p.type === 'openai' ? 'OpenAI 相容' : 'Anthropic'}
                              size="small"
                              sx={{ fontSize: 10, height: 20 }}
                            />
                            {p.api_key_set ? (
                              <Tooltip title="API Key 已設定"><VerifiedRoundedIcon fontSize="small" color="success" sx={{ fontSize: 16 }} /></Tooltip>
                            ) : (
                              <Chip label="未配置" size="small" color="warning" sx={{ height: 18, fontSize: 10 }} />
                            )}
                          </Box>
                        }
                        secondary={
                          <Typography variant="caption" color="text.secondary">
                            {(p.models || []).slice(0, 4).join(', ')}{(p.models?.length || 0) > 4 ? ' …' : ''}
                            {p.base_url && p.base_url !== 'https://api.openai.com/v1' && p.type !== 'dashscope' ? ` · ${p.base_url}` : ''}
                          </Typography>
                        }
                      />
                    </ListItem>
                  ))}
                </List>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>文字模型 (Commander)</InputLabel>
                    <Select
                      label="文字模型 (Commander)"
                      value={`${textModel.provider_id}::${textModel.model}`}
                      onChange={(e) => {
                        const [pid, m] = String(e.target.value).split('::')
                        handleActiveModel('text', pid, m)
                      }}
                    >
                      {providers.flatMap(p => (p.models || []).map(m => (
                        <MenuItem key={`${p.id}::${m}`} value={`${p.id}::${m}`}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip label={p.name} size="small" sx={{ height: 18, fontSize: 10 }} />
                            <Typography variant="body2">{m}</Typography>
                          </Box>
                        </MenuItem>
                      )))}
                    </Select>
                  </FormControl>

                  <FormControl fullWidth size="small">
                    <InputLabel>視覺模型 (Critic/Reviewer)</InputLabel>
                    <Select
                      label="視覺模型 (Critic/Reviewer)"
                      value={`${visionModel.provider_id}::${visionModel.model}`}
                      onChange={(e) => {
                        const [pid, m] = String(e.target.value).split('::')
                        handleActiveModel('vision', pid, m)
                      }}
                    >
                      {providers.flatMap(p => (p.models || []).map(m => (
                        <MenuItem key={`${p.id}::${m}`} value={`${p.id}::${m}`}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip label={p.name} size="small" sx={{ height: 18, fontSize: 10 }} />
                            <Typography variant="body2">{m}</Typography>
                          </Box>
                        </MenuItem>
                      )))}
                    </Select>
                  </FormControl>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                  注意：圖片生成（數據增強）功能僅支援 DashScope 的 qwen-image-2.0-pro 模型。
                </Typography>
              </Box>
          </SectionCard>

          <SectionCard icon={<SmartToyRoundedIcon fontSize="small" />} title="Soldier 模式">
            <FormControl fullWidth>
              <InputLabel>默認檢測模式</InputLabel>
              <Select label="默認檢測模式" value={soldierMode} onChange={(e) => setSoldierMode(e.target.value)}>
                <MenuItem value="qwen_vision">視覺 API（透過上方視覺模型）</MenuItem>
                <MenuItem value="grounded_sam">Grounded-SAM 本地（需 GPU）</MenuItem>
              </Select>
            </FormControl>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              視覺 API 模式會使用下方 Soldier 專用模型；Grounded-SAM 在本地運行，精度更高但需 GPU。
            </Typography>
            <FormControl fullWidth size="small" sx={{ mt: 1.5 }}>
              <InputLabel>Soldier 視覺模型（系統設定）</InputLabel>
              <Select
                label="Soldier 視覺模型（系統設定）"
                value={`${soldierModel.provider_id}::${soldierModel.model}`}
                onChange={(e) => {
                  const [pid, m] = String(e.target.value).split('::')
                  handleActiveModel('soldier', pid, m)
                }}
              >
                {providers.flatMap(p => (p.models || []).map(m => (
                  <MenuItem key={`soldier-${p.id}::${m}`} value={`${p.id}::${m}`}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label={p.name} size="small" sx={{ height: 18, fontSize: 10 }} />
                      <Typography variant="body2">{m}</Typography>
                    </Box>
                  </MenuItem>
                )))}
              </Select>
            </FormControl>
          </SectionCard>

          <SectionCard icon={<AutoAwesomeRoundedIcon fontSize="small" />} title="數據增強">
            <FormControlLabel
              control={<Switch checked={augEnabled} onChange={(e) => setAugEnabled(e.target.checked)} />}
              label="啟用數據增強功能 (AI 圖片生成)"
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              啟用後可在「數據增強」頁面使用 AI 圖片生成來擴充數據集。
            </Typography>
          </SectionCard>

          <Button variant="contained" size="large" startIcon={<SaveRoundedIcon />} onClick={handleSave}>
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
                  { label: '供應商總數', chip: String(providers.length), color: 'default' as const },
                  { label: 'Soldier 模式', chip: soldierMode === 'qwen_vision' ? '視覺 API' : 'Grounded-SAM', color: 'default' as const },
                  { label: '數據增強', chip: augEnabled ? '已啟用' : '已關閉', color: (augEnabled ? 'success' : 'default') as any },
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
              <Typography variant="h6" gutterBottom>當前模型</Typography>
              <Divider sx={{ mb: 2 }} />
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="caption" color="text.secondary">文字 (Commander)</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {textProvider?.name || '—'} <Typography component="span" variant="caption" color="text.secondary">/ {textModel.model}</Typography>
                </Typography>
              </Box>
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="caption" color="text.secondary">視覺 (Critic · Reviewer)</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {visionProvider?.name || '—'} <Typography component="span" variant="caption" color="text.secondary">/ {visionModel.model}</Typography>
                </Typography>
              </Box>
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="caption" color="text.secondary">視覺 (Soldier)</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {soldierProvider?.name || '—'} <Typography component="span" variant="caption" color="text.secondary">/ {soldierModel.model}</Typography>
                </Typography>
              </Box>
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="caption" color="text.secondary">圖片生成（鎖定）</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>DashScope · qwen-image-2.0-pro</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">本地訓練</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>ultralytics YOLOv8/v11</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? '編輯供應商' : '新增模型供應商'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {!editing && (
              <FormControl fullWidth>
                <InputLabel>供應商類型</InputLabel>
                <Select
                  label="供應商類型"
                  value={form.type}
                  onChange={(e) => {
                    const newType = e.target.value as ProviderType
                    const preset = PROVIDER_PRESETS[newType]
                    setForm(f => ({ ...f, type: newType, base_url: preset.base_url, models: preset.models }))
                  }}
                >
                  <MenuItem value="openai">OpenAI 相容 (OpenAI / DeepSeek / OpenRouter / Ollama …)</MenuItem>
                  <MenuItem value="anthropic">Anthropic Claude</MenuItem>
                </Select>
              </FormControl>
            )}
            <Typography variant="caption" color="text.secondary">{typePreset.hint}</Typography>

            <TextField
              label="顯示名稱"
              fullWidth
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder={form.type === 'openai' ? 'My OpenAI' : 'My Anthropic'}
            />

            <TextField
              label={`API Key${editing ? '（留空則保留原本的）' : ''}`}
              fullWidth
              type="password"
              value={form.api_key}
              onChange={(e) => setForm(f => ({ ...f, api_key: e.target.value }))}
              placeholder={form.type === 'openai' ? 'sk-...' : 'sk-ant-...'}
            />

            <TextField
              label="Base URL（可選）"
              fullWidth
              value={form.base_url}
              onChange={(e) => setForm(f => ({ ...f, base_url: e.target.value }))}
              helperText={form.type === 'openai' ? '自訂端點時填入，例：http://localhost:11434/v1（Ollama）' : '一般保留官方端點'}
            />

            <TextField
              label="可用模型（逗號分隔）"
              fullWidth
              multiline
              rows={2}
              value={form.models}
              onChange={(e) => setForm(f => ({ ...f, models: e.target.value }))}
              helperText="會出現在「文字／視覺模型」選單中。視覺任務請填入支援多模態的模型。"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleSubmitProvider}>
            {editing ? '儲存變更' : '新增'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
