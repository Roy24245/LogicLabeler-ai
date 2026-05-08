import { type ReactNode } from 'react'
import { Avatar, Box, Typography, useTheme, alpha } from '@mui/material'

interface Props {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  iconColor?: 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error'
}

export default function PageHeader({ icon, title, subtitle, actions, iconColor = 'primary' }: Props) {
  const theme = useTheme()
  const color = theme.palette[iconColor].main

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        gap: 2,
        flexWrap: 'wrap',
        mb: 3,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
        {icon && (
          <Avatar
            variant="rounded"
            sx={{
              bgcolor: alpha(color, 0.14),
              color,
              width: 48, height: 48,
              borderRadius: 3,
            }}
          >
            {icon}
          </Avatar>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" sx={{ lineHeight: 1.15 }}>{title}</Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>
      {actions && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {actions}
        </Box>
      )}
    </Box>
  )
}
