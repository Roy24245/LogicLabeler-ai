import { type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Divider,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import DashboardIcon from '@mui/icons-material/Dashboard'
import StorageIcon from '@mui/icons-material/Storage'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import ModelTrainingIcon from '@mui/icons-material/ModelTraining'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import SettingsIcon from '@mui/icons-material/Settings'
import { useStore } from '../../store/useStore'

const DRAWER_WIDTH = 260

const NAV_ITEMS = [
  { text: '儀表板', icon: <DashboardIcon />, path: '/dashboard' },
  { text: '數據集', icon: <StorageIcon />, path: '/datasets' },
  { text: '自動標註', icon: <AutoFixHighIcon />, path: '/auto-label' },
  { text: 'YOLO 訓練', icon: <ModelTrainingIcon />, path: '/training' },
  { text: '數據增強', icon: <AutoAwesomeIcon />, path: '/augmentation' },
  { text: '系統設定', icon: <SettingsIcon />, path: '/settings' },
]

export default function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { sidebarOpen, toggleSidebar } = useStore()

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          backdropFilter: 'blur(20px)',
          backgroundColor: 'rgba(15, 22, 41, 0.8)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          boxShadow: 'none',
        }}
      >
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={toggleSidebar} sx={{ mr: 2 }}>
            <MenuIcon />
          </IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #7C4DFF 0%, #00E5FF 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              LL
            </Box>
            <Typography variant="h6" noWrap>
              LogicLabeler
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="persistent"
        open={sidebarOpen}
        sx={{
          width: sidebarOpen ? DRAWER_WIDTH : 0,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', mt: 1 }}>
          <List>
            {NAV_ITEMS.map((item) => (
              <ListItemButton
                key={item.path}
                selected={location.pathname.startsWith(item.path)}
                onClick={() => navigate(item.path)}
                sx={{
                  mx: 1,
                  borderRadius: 2,
                  mb: 0.5,
                  '&.Mui-selected': {
                    backgroundColor: 'rgba(124, 77, 255, 0.15)',
                    '&:hover': { backgroundColor: 'rgba(124, 77, 255, 0.25)' },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            ))}
          </List>
          <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.06)' }} />
          <Box sx={{ px: 3, pb: 2 }}>
            <Typography variant="caption" color="text.secondary">
              LogicLabeler v1.0
            </Typography>
            <br />
            <Typography variant="caption" color="text.secondary">
              MLLM + Multi-Agent
            </Typography>
          </Box>
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          mt: 8,
          transition: 'margin 0.3s',
          ml: sidebarOpen ? 0 : `-${DRAWER_WIDTH}px`,
        }}
      >
        {children}
      </Box>
    </Box>
  )
}
