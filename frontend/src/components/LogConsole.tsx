import { useEffect, useRef } from 'react'
import { Box, Typography, alpha, useTheme } from '@mui/material'
import { MONO_FONT_FAMILY } from '../theme'

interface Props {
  lines?: string[]
  text?: string
  height?: number | string
  emptyText?: string
  colorize?: (line: string) => string | undefined
}

export default function LogConsole({ lines, text, height = 280, emptyText = '等待輸出...', colorize }: Props) {
  const theme = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const isDark = theme.palette.mode === 'dark'

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [lines, text])

  const defaultColor = (line: string) => {
    if (line.includes('[ERROR]') || line.includes('✗') || line.includes('failed')) return theme.palette.error.main
    if (line.includes('✓') || line.includes('成功') || line.includes('完成')) return theme.palette.success.main
    if (line.startsWith('===')) return theme.palette.primary.main
    if (line.includes('[Commander]')) return theme.palette.primary.main
    if (line.includes('[Soldier]')) return theme.palette.info.main
    if (line.includes('[Critic]')) return theme.palette.success.main
    if (line.includes('[RAG]')) return theme.palette.warning.main
    if (line.includes('[Review]')) return theme.palette.secondary.main
    if (line.includes('[增強]')) return theme.palette.info.main
    if (line.includes('⚠')) return theme.palette.warning.main
    return theme.palette.text.secondary
  }

  const isEmpty = (!lines || lines.length === 0) && !text

  return (
    <Box
      ref={ref}
      sx={{
        height,
        overflow: 'auto',
        p: 2,
        bgcolor: isDark ? '#0E0D11' : '#F5F3F7',
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 3,
        fontFamily: MONO_FONT_FAMILY,
        fontSize: '0.78rem',
        lineHeight: 1.7,
        '&::-webkit-scrollbar': { width: 5 },
        '&::-webkit-scrollbar-thumb': { bgcolor: alpha(theme.palette.primary.main, 0.3), borderRadius: 3 },
      }}
    >
      {isEmpty ? (
        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'inherit' }}>
          {emptyText}
        </Typography>
      ) : text ? (
        <Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', color: 'text.secondary', fontFamily: 'inherit' }}>
          {text}
        </Box>
      ) : (
        lines!.map((line, i) => (
          <Box
            key={i}
            sx={{
              display: 'block',
              color: (colorize?.(line) ?? defaultColor(line)),
              whiteSpace: 'pre-wrap',
            }}
          >
            {line}
          </Box>
        ))
      )}
    </Box>
  )
}
