import { useCallback, useEffect, useState } from 'react'
import {
  Avatar, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, Skeleton, Stack, Typography, alpha, useTheme,
} from '@mui/material'
import TipsAndUpdatesRoundedIcon from '@mui/icons-material/TipsAndUpdatesRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import { optimizePrompt, type PromptSuggestion } from '../api/client'
import { useStore } from '../store/useStore'

const SUGGESTION_COLORS: Record<string, string> = {
  more_specific: '#0061A4',
  with_logic: '#7D5260',
  more_concise: '#1B8755',
}

interface Props {
  open: boolean
  baseline: string
  onClose: () => void
  onApply: (text: string) => void
  title?: string
  subtitle?: string
}

export default function PromptOptimizerDialog({
  open, baseline, onClose, onApply,
  title = '優化標註指令',
  subtitle = '挑選一個版本套用，或重新生成 3 個新建議',
}: Props) {
  const theme = useTheme()
  const { showSnackbar } = useStore()

  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([])

  const fetchSuggestions = useCallback(async (text: string) => {
    if (!text.trim()) return
    setLoading(true)
    setSuggestions([])
    try {
      const { data } = await optimizePrompt(text)
      setSuggestions(data.suggestions || [])
    } catch (e: any) {
      showSnackbar(e?.response?.data?.detail || '優化失敗，請稍後再試', 'error')
    } finally { setLoading(false) }
  }, [showSnackbar])

  useEffect(() => {
    if (open && baseline.trim()) {
      fetchSuggestions(baseline)
    } else if (!open) {
      setSuggestions([])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleApply = (s: PromptSuggestion) => {
    onApply(s.text)
    showSnackbar('已套用優化版本', 'success')
  }

  return (
    <Dialog open={open} onClose={() => !loading && onClose()} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar sx={{ bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main', width: 36, height: 36 }}>
            <TipsAndUpdatesRoundedIcon fontSize="small" />
          </Avatar>
          <Box>
            <Typography variant="h6">{title}</Typography>
            <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{
          mb: 2, p: 1.5, borderRadius: 2,
          bgcolor: alpha(theme.palette.primary.main, 0.05),
          border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
        }}>
          <Typography variant="caption" color="text.secondary">原指令</Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{baseline}</Typography>
        </Box>

        <Stack spacing={2}>
          {loading && [0, 1, 2].map(i => (
            <Card key={`sk-${i}`} variant="outlined" sx={{ borderRadius: 3 }}>
              <CardContent>
                <Skeleton width={80} height={24} sx={{ mb: 1 }} />
                <Skeleton variant="text" />
                <Skeleton variant="text" width="90%" />
                <Skeleton variant="text" width="70%" />
              </CardContent>
            </Card>
          ))}

          {!loading && suggestions.length === 0 && (
            <Box sx={{ textAlign: 'center', color: 'text.secondary', py: 4 }}>
              <Typography variant="body2">暫無建議，請點擊「重新生成」。</Typography>
            </Box>
          )}

          {!loading && suggestions.map((s, idx) => {
            const accent = SUGGESTION_COLORS[s.label] || '#6750A4'
            return (
              <Card
                key={idx}
                variant="outlined"
                sx={{
                  borderRadius: 3,
                  borderColor: alpha(accent, 0.35),
                  transition: 'all .2s',
                  '&:hover': { borderColor: accent, boxShadow: `0 0 0 1px ${alpha(accent, 0.4)}` },
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Chip
                      label={s.title}
                      size="small"
                      sx={{ bgcolor: alpha(accent, 0.12), color: accent, fontWeight: 600 }}
                    />
                    <Typography variant="caption" color="text.secondary">版本 {idx + 1}</Typography>
                  </Box>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, mb: 1.5 }}>
                    {s.text}
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => handleApply(s)}
                      sx={{ bgcolor: accent, '&:hover': { bgcolor: accent } }}
                    >
                      使用此版本
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            )
          })}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>關閉</Button>
        <Button
          variant="outlined"
          startIcon={<RefreshRoundedIcon />}
          onClick={() => fetchSuggestions(baseline)}
          disabled={loading || !baseline.trim()}
        >
          重新生成
        </Button>
      </DialogActions>
    </Dialog>
  )
}
