import { type ReactNode } from 'react'
import { Avatar, Box, Card, CardContent, Divider, Typography, alpha, useTheme } from '@mui/material'

interface Props {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  divider?: boolean
  dense?: boolean
  children: ReactNode
  iconColor?: 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error'
  sx?: any
}

export default function SectionCard({
  icon, title, subtitle, action,
  divider = true, dense = false,
  children, iconColor = 'primary', sx,
}: Props) {
  const theme = useTheme()
  const color = theme.palette[iconColor].main

  return (
    <Card sx={{ mb: 2, ...sx }}>
      <CardContent sx={{ p: dense ? 2 : 2.5, '&:last-child': { pb: dense ? 2 : 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: divider ? 2 : 1.5 }}>
          {icon && (
            <Avatar
              variant="rounded"
              sx={{
                bgcolor: alpha(color, 0.14),
                color,
                width: 36, height: 36,
                borderRadius: 2.5,
              }}
            >
              {icon}
            </Avatar>
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ lineHeight: 1.2 }}>{title}</Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {action}
        </Box>
        {divider && <Divider sx={{ mb: 2 }} />}
        {children}
      </CardContent>
    </Card>
  )
}
