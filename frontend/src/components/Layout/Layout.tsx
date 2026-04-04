import { type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  AppBar, Box, Drawer, IconButton, List, ListItemButton, ListItemIcon,
  ListItemText, Toolbar, Typography, Tooltip, ToggleButtonGroup, ToggleButton,
  useTheme, alpha,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded'
import StorageRoundedIcon from '@mui/icons-material/StorageRounded'
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded'
import ModelTrainingRoundedIcon from '@mui/icons-material/ModelTrainingRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded'
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded'
import SettingsBrightnessRoundedIcon from '@mui/icons-material/SettingsBrightnessRounded'
import { useStore } from '../../store/useStore'

const DRAWER_WIDTH = 280

const NAV_ITEMS = [
  { text: '儀表板', icon: <DashboardRoundedIcon />, path: '/dashboard' },
  { text: '數據集', icon: <StorageRoundedIcon />, path: '/datasets' },
  { text: '自動標註', icon: <AutoFixHighRoundedIcon />, path: '/auto-label' },
  { text: 'YOLO 訓練', icon: <ModelTrainingRoundedIcon />, path: '/training' },
  { text: '數據增強', icon: <AutoAwesomeRoundedIcon />, path: '/augmentation' },
  { text: '系統設定', icon: <SettingsRoundedIcon />, path: '/settings' },
]

export default function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const theme = useTheme()
  const { sidebarOpen, toggleSidebar, themeMode, setThemeMode } = useStore()

  const isDark = theme.palette.mode === 'dark'

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          backdropFilter: 'blur(20px)',
          bgcolor: alpha(theme.palette.background.paper, 0.85),
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Toolbar sx={{ gap: 1 }}>
          <IconButton onClick={toggleSidebar} sx={{ color: 'text.primary' }}>
            <MenuIcon />
          </IconButton>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
            <Box
              sx={{
                width: 36, height: 36, borderRadius: '12px',
                background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${isDark ? '#CCC2DC' : '#625B71'} 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 13, color: isDark ? '#1D1B20' : '#FFF',
                letterSpacing: '-0.5px',
              }}
            >
              LL
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
              LogicLabeler
            </Typography>
          </Box>

          <ToggleButtonGroup
            value={themeMode}
            exclusive
            onChange={(_, v) => v && setThemeMode(v)}
            size="small"
            sx={{
              bgcolor: alpha(theme.palette.primary.main, 0.08),
              borderRadius: 3,
              '& .MuiToggleButton-root': {
                border: 'none', borderRadius: '12px !important', px: 1.2, py: 0.5,
                color: 'text.secondary',
                '&.Mui-selected': {
                  bgcolor: alpha(theme.palette.primary.main, 0.16),
                  color: 'primary.main',
                },
              },
            }}
          >
            <ToggleButton value="light"><Tooltip title="亮色"><LightModeRoundedIcon fontSize="small" /></Tooltip></ToggleButton>
            <ToggleButton value="system"><Tooltip title="跟隨系統"><SettingsBrightnessRoundedIcon fontSize="small" /></Tooltip></ToggleButton>
            <ToggleButton value="dark"><Tooltip title="暗色"><DarkModeRoundedIcon fontSize="small" /></Tooltip></ToggleButton>
          </ToggleButtonGroup>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: sidebarOpen ? DRAWER_WIDTH : 0,
          flexShrink: 0,
          transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            transform: sidebarOpen ? 'none' : `translateX(-${DRAWER_WIDTH}px)`,
            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            overflowX: 'hidden',
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', mt: 1, px: 0.5 }}>
          <List sx={{ px: 0.5 }}>
            {NAV_ITEMS.map((item) => {
              const active = location.pathname.startsWith(item.path)
              return (
                <ListItemButton
                  key={item.path}
                  selected={active}
                  onClick={() => navigate(item.path)}
                  sx={{
                    mb: 0.5,
                    py: 1.2,
                    pl: 2,
                    '&.Mui-selected': {
                      bgcolor: alpha(theme.palette.primary.main, 0.12),
                      color: 'primary.main',
                      '& .MuiListItemIcon-root': { color: 'primary.main' },
                      '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.16) },
                    },
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.06) },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 44, color: active ? 'primary.main' : 'text.secondary' }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.text}
                    primaryTypographyProps={{ fontWeight: active ? 600 : 400, fontSize: 14 }}
                  />
                </ListItemButton>
              )
            })}
          </List>

          <Box sx={{ px: 2.5, mt: 'auto', pt: 3, pb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.6 }}>
              LogicLabeler v2.0
            </Typography>
            <br />
            <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.6 }}>
              Material 3 Design
            </Typography>
          </Box>
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, md: 3 },
          mt: 8,
          transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          minWidth: 0,
          overflow: 'auto',
        }}
      >
        {children}
      </Box>
    </Box>
  )
}
