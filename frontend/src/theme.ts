import { createTheme, type ThemeOptions } from '@mui/material/styles'

const shared: ThemeOptions = {
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: '"Google Sans", "Noto Sans TC", "Inter", "Roboto", "Helvetica", sans-serif',
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontWeight: 600, letterSpacing: '-0.01em' },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 500 },
    button: { textTransform: 'none' as const, fontWeight: 600 },
  },
}

const m3Components: ThemeOptions['components'] = {
  MuiCssBaseline: {
    styleOverrides: {
      '@import': "url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;600;700&display=swap')",
    },
  },
  MuiButton: {
    defaultProps: { disableElevation: true },
    styleOverrides: {
      root: { borderRadius: 20, fontWeight: 600, textTransform: 'none', padding: '10px 24px' },
      contained: { boxShadow: 'none' },
      outlined: { borderWidth: 1 },
    },
  },
  MuiCard: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      root: { borderRadius: 20, backgroundImage: 'none' },
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: { borderRadius: 28 },
    },
  },
  MuiChip: {
    styleOverrides: {
      root: { borderRadius: 8, fontWeight: 500 },
    },
  },
  MuiTextField: {
    defaultProps: { variant: 'outlined' },
    styleOverrides: {
      root: { '& .MuiOutlinedInput-root': { borderRadius: 12 } },
    },
  },
  MuiSelect: {
    styleOverrides: {
      root: { borderRadius: 12 },
    },
  },
  MuiLinearProgress: {
    styleOverrides: {
      root: { borderRadius: 8, height: 6 },
    },
  },
  MuiTab: {
    styleOverrides: {
      root: { textTransform: 'none', fontWeight: 600, borderRadius: 20, minHeight: 40 },
    },
  },
  MuiTabs: {
    styleOverrides: {
      indicator: { borderRadius: 20, height: 3 },
    },
  },
  MuiListItemButton: {
    styleOverrides: {
      root: { borderRadius: 28, margin: '2px 12px' },
    },
  },
  MuiPaper: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      root: { backgroundImage: 'none' },
    },
  },
  MuiFab: {
    styleOverrides: {
      root: { borderRadius: 16, boxShadow: '0 1px 3px 0 rgba(0,0,0,0.12)' },
    },
  },
  MuiSwitch: {
    styleOverrides: {
      root: { padding: 8 },
      track: { borderRadius: 22, opacity: 1 },
      thumb: { boxShadow: 'none' },
    },
  },
  MuiAppBar: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      root: { boxShadow: 'none' },
    },
  },
  MuiDrawer: {
    styleOverrides: {
      paper: { borderRight: 'none' },
    },
  },
  MuiTableCell: {
    styleOverrides: {
      root: { borderBottom: '1px solid var(--mui-palette-divider)' },
    },
  },
}

export const lightTheme = createTheme({
  ...shared,
  palette: {
    mode: 'light',
    primary: { main: '#6750A4', light: '#EADDFF', dark: '#4F378B', contrastText: '#FFFFFF' },
    secondary: { main: '#625B71', light: '#E8DEF8', dark: '#4A4458' },
    error: { main: '#B3261E', light: '#F9DEDC', dark: '#8C1D18' },
    warning: { main: '#E8A317', light: '#FFF3E0' },
    success: { main: '#1B8755', light: '#E8F5E9' },
    info: { main: '#0061A4', light: '#E3F2FD' },
    background: { default: '#FEF7FF', paper: '#FFFFFF' },
    divider: 'rgba(0,0,0,0.08)',
    text: { primary: '#1D1B20', secondary: '#49454F' },
    action: {
      hover: 'rgba(103,80,164,0.08)',
      selected: 'rgba(103,80,164,0.12)',
      focus: 'rgba(103,80,164,0.12)',
    },
  },
  components: {
    ...m3Components,
    MuiCard: {
      ...m3Components?.MuiCard,
      styleOverrides: {
        root: {
          borderRadius: 20,
          backgroundImage: 'none',
          border: '1px solid rgba(0,0,0,0.08)',
          backgroundColor: '#FFFBFE',
        },
      },
    },
    MuiAppBar: {
      ...m3Components?.MuiAppBar,
      styleOverrides: {
        root: {
          boxShadow: 'none',
          backgroundColor: '#FFFBFE',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          color: '#1D1B20',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: 'none',
          backgroundColor: '#F7F2FA',
        },
      },
    },
  },
})

export const darkTheme = createTheme({
  ...shared,
  palette: {
    mode: 'dark',
    primary: { main: '#D0BCFF', light: '#4F378B', dark: '#EADDFF', contrastText: '#381E72' },
    secondary: { main: '#CCC2DC', light: '#4A4458', dark: '#E8DEF8' },
    error: { main: '#F2B8B5', light: '#601410', dark: '#F9DEDC' },
    warning: { main: '#FFD580', light: '#4A3800' },
    success: { main: '#7DD0A1', light: '#0D3B22' },
    info: { main: '#A1C9F7', light: '#0A305A' },
    background: { default: '#141218', paper: '#1D1B20' },
    divider: 'rgba(255,255,255,0.08)',
    text: { primary: '#E6E0E9', secondary: '#CAC4D0' },
    action: {
      hover: 'rgba(208,188,255,0.08)',
      selected: 'rgba(208,188,255,0.12)',
      focus: 'rgba(208,188,255,0.12)',
    },
  },
  components: {
    ...m3Components,
    MuiCard: {
      ...m3Components?.MuiCard,
      styleOverrides: {
        root: {
          borderRadius: 20,
          backgroundImage: 'none',
          border: '1px solid rgba(255,255,255,0.08)',
          backgroundColor: '#1D1B20',
        },
      },
    },
    MuiAppBar: {
      ...m3Components?.MuiAppBar,
      styleOverrides: {
        root: {
          boxShadow: 'none',
          backgroundColor: '#1D1B20',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          color: '#E6E0E9',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: 'none',
          backgroundColor: '#1D1B20',
        },
      },
    },
  },
})
