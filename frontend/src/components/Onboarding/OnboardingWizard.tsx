import { useEffect, useState } from 'react'
import {
  Box, Button, Card, CardContent, Chip, FormControl, InputLabel, MenuItem,
  Select, Stack, Step, StepLabel, Stepper, TextField, Typography,
  alpha, useTheme,
} from '@mui/material'
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded'
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded'
import SettingsBrightnessRoundedIcon from '@mui/icons-material/SettingsBrightnessRounded'
import KeyRoundedIcon from '@mui/icons-material/KeyRounded'
import HubRoundedIcon from '@mui/icons-material/HubRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import { updateSettings, createProvider, getSettings } from '../../api/client'
import { useStore } from '../../store/useStore'

type ProviderType = 'openai' | 'anthropic'

const PROVIDER_PRESETS: Record<ProviderType, { base_url: string; models: string }> = {
  openai: { base_url: 'https://api.openai.com/v1', models: 'gpt-4o, gpt-4o-mini, gpt-4-turbo' },
  anthropic: { base_url: 'https://api.anthropic.com', models: 'claude-sonnet-4-5, claude-opus-4-5, claude-3-5-haiku-latest' },
}

const STEPS = ['歡迎', '外觀', 'API Key', '模型供應商', '完成']

export default function OnboardingWizard() {
  const theme = useTheme()
  const { themeMode, setThemeMode, setOnboardingCompleted, showSnackbar } = useStore()

  const [step, setStep] = useState(0)
  const [apiKey, setApiKey] = useState('')
  const [keyAlreadySet, setKeyAlreadySet] = useState(false)
  const [editingKey, setEditingKey] = useState(false)
  const [checkingKey, setCheckingKey] = useState(true)

  const [providerEnabled, setProviderEnabled] = useState(false)
  const [pType, setPType] = useState<ProviderType>('openai')
  const [pName, setPName] = useState('')
  const [pKey, setPKey] = useState('')
  const [pBaseUrl, setPBaseUrl] = useState(PROVIDER_PRESETS.openai.base_url)
  const [pModels, setPModels] = useState(PROVIDER_PRESETS.openai.models)

  const [submitting, setSubmitting] = useState(false)

  const isDark = theme.palette.mode === 'dark'

  useEffect(() => {
    (async () => {
      try {
        const { data } = await getSettings()
        setKeyAlreadySet(!!data.dashscope_api_key_set)
      } catch {
        setKeyAlreadySet(false)
      } finally {
        setCheckingKey(false)
      }
    })()
  }, [])

  const handleProviderTypeChange = (t: ProviderType) => {
    setPType(t)
    setPBaseUrl(PROVIDER_PRESETS[t].base_url)
    setPModels(PROVIDER_PRESETS[t].models)
  }

  const handleNext = () => setStep((s) => Math.min(s + 1, STEPS.length - 1))
  const handleBack = () => setStep((s) => Math.max(s - 1, 0))

  const handleFinish = async () => {
    setSubmitting(true)
    try {
      if (apiKey.trim()) {
        await updateSettings({ dashscope_api_key: apiKey.trim() } as any)
      }
      if (providerEnabled && pName.trim() && pKey.trim()) {
        await createProvider({
          name: pName.trim(),
          type: pType,
          api_key: pKey.trim(),
          base_url: pBaseUrl.trim(),
          models: pModels.split(',').map(m => m.trim()).filter(Boolean),
        })
      }
      setOnboardingCompleted(true)
      showSnackbar('設定完成，歡迎使用 LogicLabeler', 'success')
    } catch (e: any) {
      showSnackbar(e?.response?.data?.detail || '設定儲存失敗，請稍後重試', 'error')
    } finally { setSubmitting(false) }
  }

  const themeOption = (value: 'light' | 'system' | 'dark', label: string, sub: string, icon: React.ReactNode) => {
    const selected = themeMode === value
    return (
      <Card
        variant="outlined"
        onClick={() => setThemeMode(value)}
        sx={{
          cursor: 'pointer',
          flex: 1,
          minWidth: 0,
          borderRadius: 4,
          borderWidth: 2,
          borderColor: selected ? theme.palette.primary.main : theme.palette.divider,
          bgcolor: selected ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
          transition: 'all .2s',
          '&:hover': { borderColor: theme.palette.primary.main, bgcolor: alpha(theme.palette.primary.main, 0.06) },
        }}
      >
        <CardContent sx={{ textAlign: 'center', py: 3 }}>
          <Box sx={{
            width: 56, height: 56, mx: 'auto', mb: 1.5, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: selected ? alpha(theme.palette.primary.main, 0.16) : alpha(theme.palette.text.primary, 0.06),
            color: selected ? theme.palette.primary.main : 'text.secondary',
          }}>
            {icon}
          </Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{label}</Typography>
          <Typography variant="caption" color="text.secondary">{sub}</Typography>
        </CardContent>
      </Card>
    )
  }

  const summary = (
    <Stack spacing={1}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="body2" color="text.secondary">主題模式</Typography>
        <Chip label={themeMode === 'light' ? '亮色' : themeMode === 'dark' ? '暗色' : '跟隨系統'} size="small" />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="body2" color="text.secondary">DashScope API Key</Typography>
        <Chip
          label={
            apiKey.trim()
              ? (keyAlreadySet && editingKey ? '將更新' : '已設定')
              : keyAlreadySet ? '已配置（保留現有）' : '稍後設定'
          }
          size="small"
          color={apiKey.trim() || keyAlreadySet ? 'success' : 'default'}
        />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="body2" color="text.secondary">自訂模型供應商</Typography>
        <Chip
          label={providerEnabled && pName.trim() && pKey.trim() ? `已新增「${pName}」` : '使用預設 Qwen'}
          size="small"
          color={providerEnabled && pName.trim() && pKey.trim() ? 'success' : 'default'}
        />
      </Box>
    </Stack>
  )

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        overflow: 'auto',
        background: isDark
          ? `radial-gradient(circle at 20% 20%, ${alpha(theme.palette.primary.main, 0.18)} 0%, ${theme.palette.background.default} 60%)`
          : `radial-gradient(circle at 20% 20%, ${alpha(theme.palette.primary.main, 0.18)} 0%, #F7F2FA 60%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: { xs: 2, md: 4 },
      }}
    >
      <Card
        sx={{
          width: '100%',
          maxWidth: 720,
          borderRadius: 5,
          boxShadow: `0 12px 40px ${alpha(theme.palette.primary.main, 0.18)}`,
          overflow: 'hidden',
        }}
      >
        <Box sx={{ px: { xs: 3, md: 5 }, pt: 4, pb: 2 }}>
          <Stepper activeStep={step} alternativeLabel>
            {STEPS.map((label) => (
              <Step key={label}><StepLabel>{label}</StepLabel></Step>
            ))}
          </Stepper>
        </Box>

        <CardContent sx={{ px: { xs: 3, md: 5 }, py: 3, minHeight: 360 }}>
          {step === 0 && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Box
                component="img"
                src="/logo.png"
                alt="LogicLabeler"
                sx={{
                  width: 96, height: 96, borderRadius: 4, mb: 2,
                  boxShadow: `0 6px 20px ${alpha(theme.palette.primary.main, 0.3)}`,
                }}
              />
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                歡迎使用 LogicLabeler
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 480, mx: 'auto', mb: 1 }}>
                MLLM 語義推理 + 多智能體協作的下一代自動標註系統。
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 480, mx: 'auto' }}>
                這是您第一次進入系統，接下來幾個步驟將協助您完成基本配置：外觀、API 金鑰與模型供應商。整個過程約一分鐘即可完成。
              </Typography>
            </Box>
          )}

          {step === 1 && (
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>選擇介面外觀</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                點擊任一卡片即時套用，可隨時在系統設定中變更。
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                {themeOption('light', '亮色', '明亮清晰', <LightModeRoundedIcon />)}
                {themeOption('system', '跟隨系統', '自動切換', <SettingsBrightnessRoundedIcon />)}
                {themeOption('dark', '暗色', '低光護眼', <DarkModeRoundedIcon />)}
              </Stack>
            </Box>
          )}

          {step === 2 && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Box sx={{
                  width: 40, height: 40, borderRadius: 2,
                  bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <KeyRoundedIcon />
                </Box>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>DashScope API Key</Typography>
                  <Typography variant="caption" color="text.secondary">
                    阿里雲百煉 API 金鑰，用於預設的 Qwen 系列模型
                  </Typography>
                </Box>
              </Box>

              {keyAlreadySet && !editingKey ? (
                <Box
                  sx={{
                    p: 2.5, borderRadius: 3,
                    border: `1px solid ${alpha(theme.palette.success.main, 0.4)}`,
                    bgcolor: alpha(theme.palette.success.main, 0.08),
                    display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
                  }}
                >
                  <Box sx={{
                    width: 44, height: 44, borderRadius: '50%',
                    bgcolor: alpha(theme.palette.success.main, 0.18),
                    color: 'success.main',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <VerifiedRoundedIcon />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>已偵測到既有 API Key</Typography>
                    <Typography variant="caption" color="text.secondary">
                      系統先前已配置過 DashScope API Key，您可直接沿用，或點擊「修改」以更換為新的金鑰。
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<EditRoundedIcon />}
                    onClick={() => { setEditingKey(true); setApiKey('') }}
                  >
                    修改
                  </Button>
                </Box>
              ) : (
                <>
                  {keyAlreadySet && editingKey && (
                    <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                      <Chip
                        size="small"
                        color="warning"
                        variant="outlined"
                        label="編輯模式：留空送出將維持現有金鑰"
                      />
                      <Button
                        size="small"
                        startIcon={<CloseRoundedIcon />}
                        onClick={() => { setEditingKey(false); setApiKey('') }}
                      >
                        取消修改
                      </Button>
                    </Box>
                  )}
                  <TextField
                    fullWidth
                    type="password"
                    placeholder={keyAlreadySet ? '輸入新 API Key 以替換現有金鑰' : 'sk-...'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    helperText={
                      keyAlreadySet
                        ? '留空則保留原有 API Key 不變；若您只想使用其他供應商也可繼續略過。'
                        : '本欄位為選填，您可稍後在「系統設定 → API 配置」中再設定。若您僅使用其他供應商（OpenAI / Anthropic）也可留空。'
                    }
                    autoFocus
                    disabled={checkingKey}
                  />
                  <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.info.main, 0.08), border: `1px solid ${alpha(theme.palette.info.main, 0.3)}` }}>
                    <Typography variant="caption" color="text.secondary">
                      取得方式：<a href="https://bailian.console.aliyun.com/?apiKey=1" target="_blank" rel="noopener noreferrer" style={{ color: theme.palette.primary.main }}>阿里雲百煉控制台</a> → API-KEY 管理 → 建立新的 API Key
                    </Typography>
                  </Box>
                </>
              )}
            </Box>
          )}

          {step === 3 && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Box sx={{
                  width: 40, height: 40, borderRadius: 2,
                  bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <HubRoundedIcon />
                </Box>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>自訂模型供應商</Typography>
                  <Typography variant="caption" color="text.secondary">
                    可選；除了內建 DashScope 外，可額外接入 OpenAI 相容或 Anthropic
                  </Typography>
                </Box>
              </Box>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
                <Card
                  variant="outlined"
                  onClick={() => setProviderEnabled(false)}
                  sx={{
                    flex: 1, cursor: 'pointer', borderRadius: 3, borderWidth: 2,
                    borderColor: !providerEnabled ? theme.palette.primary.main : theme.palette.divider,
                    bgcolor: !providerEnabled ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
                  }}
                >
                  <CardContent>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>使用預設 Qwen 模型</Typography>
                    <Typography variant="caption" color="text.secondary">
                      跳過此步，直接使用內建 DashScope 的 qwen-plus / qwen3.6-plus / qwen-vl-plus
                    </Typography>
                  </CardContent>
                </Card>
                <Card
                  variant="outlined"
                  onClick={() => setProviderEnabled(true)}
                  sx={{
                    flex: 1, cursor: 'pointer', borderRadius: 3, borderWidth: 2,
                    borderColor: providerEnabled ? theme.palette.primary.main : theme.palette.divider,
                    bgcolor: providerEnabled ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
                  }}
                >
                  <CardContent>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>新增自訂供應商</Typography>
                    <Typography variant="caption" color="text.secondary">
                      接入 OpenAI / OpenRouter / DeepSeek / Anthropic …
                    </Typography>
                  </CardContent>
                </Card>
              </Stack>

              {providerEnabled && (
                <Stack spacing={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>供應商類型</InputLabel>
                    <Select
                      label="供應商類型"
                      value={pType}
                      onChange={(e) => handleProviderTypeChange(e.target.value as ProviderType)}
                    >
                      <MenuItem value="openai">OpenAI 相容（OpenAI / OpenRouter / DeepSeek / Ollama …）</MenuItem>
                      <MenuItem value="anthropic">Anthropic Claude</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField size="small" label="顯示名稱" value={pName} onChange={(e) => setPName(e.target.value)} placeholder={pType === 'openai' ? 'My OpenAI' : 'My Anthropic'} fullWidth />
                  <TextField size="small" label="API Key" type="password" value={pKey} onChange={(e) => setPKey(e.target.value)} placeholder={pType === 'openai' ? 'sk-...' : 'sk-ant-...'} fullWidth />
                  <TextField size="small" label="Base URL（可選）" value={pBaseUrl} onChange={(e) => setPBaseUrl(e.target.value)} fullWidth />
                  <TextField size="small" label="可用模型（逗號分隔）" value={pModels} onChange={(e) => setPModels(e.target.value)} fullWidth multiline rows={2} />
                </Stack>
              )}
            </Box>
          )}

          {step === 4 && (
            <Box sx={{ textAlign: 'center', py: 1 }}>
              <CheckCircleRoundedIcon sx={{ fontSize: 72, color: 'success.main', mb: 1 }} />
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>準備就緒！</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                以下是您的初始化設定摘要，點擊「開始使用」進入儀表板。
              </Typography>
              <Box sx={{ maxWidth: 420, mx: 'auto', textAlign: 'left', p: 2.5, borderRadius: 3, bgcolor: alpha(theme.palette.primary.main, 0.05), border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}` }}>
                {summary}
              </Box>
            </Box>
          )}
        </CardContent>

        <Box sx={{
          px: { xs: 3, md: 5 }, py: 2.5, borderTop: `1px solid ${theme.palette.divider}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          bgcolor: alpha(theme.palette.primary.main, 0.03),
        }}>
          <Box>
            {step > 0 && (
              <Button startIcon={<ArrowBackRoundedIcon />} onClick={handleBack} disabled={submitting}>
                上一步
              </Button>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {step > 0 && step < STEPS.length - 1 && (
              <Button onClick={handleNext} disabled={submitting} color="inherit">
                跳過
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button
                variant="contained"
                endIcon={<ArrowForwardRoundedIcon />}
                onClick={handleNext}
                disabled={submitting}
              >
                {step === 0 ? '開始設置' : '下一步'}
              </Button>
            ) : (
              <Button
                variant="contained"
                size="large"
                startIcon={<RocketLaunchRoundedIcon />}
                onClick={handleFinish}
                disabled={submitting}
              >
                {submitting ? '儲存中...' : '開始使用'}
              </Button>
            )}
          </Box>
        </Box>
      </Card>
    </Box>
  )
}
