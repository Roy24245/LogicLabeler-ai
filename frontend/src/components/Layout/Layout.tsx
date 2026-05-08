import { type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  AppBar, Box, Drawer, IconButton, List, ListItemButton, ListItemIcon,
  ListItemText, Toolbar, Typography, Tooltip, ToggleButtonGroup, ToggleButton,
  useTheme, alpha, Divider,
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

interface NavItem { text: string; icon: React.ReactNode; path: string; group: string }

const NAV_ITEMS: NavItem[] = [
  { text: '儀表板', icon: <DashboardRoundedIcon />, path: '/dashboard', group: '總覽' },
  { text: '數據集', icon: <StorageRoundedIcon />, path: '/datasets', group: '數據' },
  { text: '自動標註', icon: <AutoFixHighRoundedIcon />, path: '/auto-label', group: '智能' },
  { text: '數據增強', icon: <AutoAwesomeRoundedIcon />, path: '/augmentation', group: '智能' },
  { text: 'YOLO 訓練', icon: <ModelTrainingRoundedIcon />, path: '/training', group: '訓練' },
  { text: '系統設定', icon: <SettingsRoundedIcon />, path: '/settings', group: '系統' },
]

export default function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const theme = useTheme()
  const { sidebarOpen, toggleSidebar, themeMode, setThemeMode } = useStore()

  const groups = NAV_ITEMS.reduce<Record<string, NavItem[]>>((acc, item) => {
    (acc[item.group] ||= []).push(item); return acc
  }, {})

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: 1, px: { xs: 1.5, sm: 2 } }}>
          <IconButton onClick={toggleSidebar} sx={{ color: 'text.primary' }} aria-label="切換選單">
            <MenuIcon />
          </IconButton>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flex: 1, minWidth: 0 }}>
            <Box
              component="img"
              src="/logo.png"
              alt="LogicLabeler"
              sx={{
                width: 36, height: 36, borderRadius: '10px',
                objectFit: 'cover',
                boxShadow: `0 2px 6px ${alpha(theme.palette.primary.main, 0.25)}`,
              }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                LogicLabeler
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, lineHeight: 1.1 }}>
                MLLM × Multi-Agent Auto-Annotation
              </Typography>
            </Box>
          </Box>

          <ToggleButtonGroup
            value={themeMode}
            exclusive
            onChange={(_, v) => v && setThemeMode(v)}
            size="small"
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
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', mt: 1, flex: 1, display: 'flex', flexDirection: 'column' }}>
          {Object.entries(groups).map(([group, items], gi) => (
            <Box key={group} sx={{ mb: 0.5 }}>
              <Typography
                variant="overline"
                sx={{
                  display: 'block', px: 3, mt: gi === 0 ? 0.5 : 1.5, mb: 0.5,
                  color: 'text.secondary', opacity: 0.7, fontSize: '0.66rem',
                }}
              >
                {group}
              </Typography>
              <List disablePadding>
                {items.map((item) => {
                  const active = location.pathname.startsWith(item.path)
                  return (
                    <ListItemButton
                      key={item.path}
                      selected={active}
                      onClick={() => navigate(item.path)}
                      sx={{ py: 1 }}
                    >
                      <ListItemIcon sx={{ minWidth: 40, color: active ? 'primary.main' : 'text.secondary' }}>
                        {item.icon}
                      </ListItemIcon>
                      <ListItemText
                        primary={item.text}
                        primaryTypographyProps={{ fontWeight: active ? 600 : 500, fontSize: '0.92rem' }}
                      />
                    </ListItemButton>
                  )
                })}
              </List>
            </Box>
          ))}

          <Box sx={{ flex: 1 }} />
          <Divider sx={{ mx: 2, mt: 1 }} />
          <Box sx={{ px: 3, py: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', opacity: 0.7 }}>
              LogicLabeler · v2.0
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', opacity: 0.55, fontSize: '0.66rem' }}>
              Material Design 3
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
          minWidth: 0,
          overflow: 'auto',
        }}
      >
        {children}
      </Box>
    </Box>
  )
}
