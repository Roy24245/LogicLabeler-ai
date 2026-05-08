import { createTheme, type ThemeOptions, alpha } from '@mui/material/styles'

declare module '@mui/material/Button' {
  interface ButtonPropsVariantOverrides {
    tonal: true
  }
}

const FONT_FAMILY = '"Google Sans", "Noto Sans TC", "Inter", "Roboto", "Helvetica", sans-serif'
const MONO_FAMILY = '"JetBrains Mono", "Fira Code", "Roboto Mono", monospace'

const shared: ThemeOptions = {
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: FONT_FAMILY,
    h1: { fontWeight: 700, letterSpacing: '-0.025em' },
    h2: { fontWeight: 700, letterSpacing: '-0.022em' },
    h3: { fontWeight: 700, letterSpacing: '-0.02em' },
    h4: { fontWeight: 700, letterSpacing: '-0.018em', fontSize: '1.75rem' },
    h5: { fontWeight: 600, letterSpacing: '-0.012em', fontSize: '1.4rem' },
    h6: { fontWeight: 600, letterSpacing: '-0.005em', fontSize: '1.05rem' },
    subtitle1: { fontWeight: 500 },
    subtitle2: { fontWeight: 600, letterSpacing: '0.005em' },
    body1: { lineHeight: 1.65 },
    body2: { lineHeight: 1.6 },
    button: { textTransform: 'none' as const, fontWeight: 600, letterSpacing: '0.005em' },
    overline: { fontWeight: 600, letterSpacing: '0.08em' },
  },
}

const lightPalette = {
  primary:   { main: '#6750A4', light: '#EADDFF', dark: '#4F378B', contrastText: '#FFFFFF' },
  secondary: { main: '#625B71', light: '#E8DEF8', dark: '#4A4458', contrastText: '#FFFFFF' },
  error:     { main: '#B3261E', light: '#F9DEDC', dark: '#8C1D18', contrastText: '#FFFFFF' },
  warning:   { main: '#B26B00', light: '#FFF1D6', dark: '#7A4900', contrastText: '#FFFFFF' },
  success:   { main: '#1B8755', light: '#D8F0E1', dark: '#0F5C39', contrastText: '#FFFFFF' },
  info:      { main: '#0061A4', light: '#D1E4FF', dark: '#003C73', contrastText: '#FFFFFF' },
  background:{ default: '#FAF8FC', paper: '#FFFFFF' },
  divider:   'rgba(28, 27, 31, 0.08)',
  text:      { primary: '#1D1B20', secondary: '#49454F', disabled: 'rgba(28, 27, 31, 0.38)' },
  action: {
    hover:           'rgba(103, 80, 164, 0.08)',
    selected:        'rgba(103, 80, 164, 0.12)',
    focus:           'rgba(103, 80, 164, 0.12)',
    disabled:        'rgba(28, 27, 31, 0.38)',
    disabledBackground: 'rgba(28, 27, 31, 0.12)',
  },
}

const darkPalette = {
  primary:   { main: '#D0BCFF', light: '#4F378B', dark: '#EADDFF', contrastText: '#381E72' },
  secondary: { main: '#CCC2DC', light: '#4A4458', dark: '#E8DEF8', contrastText: '#332D41' },
  error:     { main: '#F2B8B5', light: '#601410', dark: '#F9DEDC', contrastText: '#601410' },
  warning:   { main: '#FFD580', light: '#4A3800', dark: '#FFE7B5', contrastText: '#3F2E00' },
  success:   { main: '#7DD0A1', light: '#0D3B22', dark: '#A6E3BE', contrastText: '#003920' },
  info:      { main: '#A1C9F7', light: '#0A305A', dark: '#C7DDF9', contrastText: '#00325B' },
  background:{ default: '#141218', paper: '#1D1B20' },
  divider:   'rgba(230, 224, 233, 0.10)',
  text:      { primary: '#E6E0E9', secondary: '#CAC4D0', disabled: 'rgba(230, 224, 233, 0.38)' },
  action: {
    hover:           'rgba(208, 188, 255, 0.10)',
    selected:        'rgba(208, 188, 255, 0.16)',
    focus:           'rgba(208, 188, 255, 0.16)',
    disabled:        'rgba(230, 224, 233, 0.38)',
    disabledBackground: 'rgba(230, 224, 233, 0.12)',
  },
}

function buildComponents(mode: 'light' | 'dark'): ThemeOptions['components'] {
  const p = mode === 'light' ? lightPalette : darkPalette
  const isDark = mode === 'dark'

  const surfaceContainer = isDark ? '#211F26' : '#F4EFF6'
  const surfaceContainerHigh = isDark ? '#2B2930' : '#ECE6EE'
  const drawerBg = isDark ? '#1B1A1F' : '#F7F2FA'

  return {
    MuiCssBaseline: {
      styleOverrides: {
        '@import':
          "url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap')",
        body: {
          fontFeatureSettings: '"cv02","cv03","cv04","cv11"',
          WebkitFontSmoothing: 'antialiased',
        },
        '*::-webkit-scrollbar': { width: 8, height: 8 },
        '*::-webkit-scrollbar-thumb': { background: alpha(p.primary.main, 0.25), borderRadius: 8 },
        '*::-webkit-scrollbar-thumb:hover': { background: alpha(p.primary.main, 0.4) },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true, disableRipple: false },
      styleOverrides: {
        root: ({ ownerState }) => ({
          borderRadius: 999,
          fontWeight: 600,
          textTransform: 'none' as const,
          paddingInline: 20,
          paddingBlock: 8,
          minHeight: 40,
          letterSpacing: '0.005em',
          ...(ownerState.size === 'small' && {
            paddingInline: 14, paddingBlock: 4, minHeight: 32, fontSize: '0.825rem',
          }),
          ...(ownerState.size === 'large' && {
            paddingInline: 24, paddingBlock: 10, minHeight: 48, fontSize: '0.95rem',
          }),
        }),
        contained: { boxShadow: 'none', '&:hover': { boxShadow: 'none' } },
        outlined: { borderWidth: 1 },
        text: { paddingInline: 12 },
      },
      variants: [
        {
          props: { variant: 'tonal' as any },
          style: ({ theme }) => ({
            backgroundColor: alpha(theme.palette.primary.main, isDark ? 0.20 : 0.12),
            color: theme.palette.primary.main,
            '&:hover': { backgroundColor: alpha(theme.palette.primary.main, isDark ? 0.28 : 0.18) },
          }),
        },
      ],
    },

    MuiIconButton: {
      styleOverrides: {
        root: { borderRadius: 999, transition: 'background-color .15s ease' },
        sizeSmall: { padding: 6 },
      },
    },

    MuiCard: {
      defaultProps: { elevation: 0, variant: 'outlined' },
      styleOverrides: {
        root: {
          borderRadius: 20,
          backgroundImage: 'none',
          backgroundColor: p.background.paper,
          borderColor: p.divider,
          transition: 'border-color .2s ease, box-shadow .2s ease, transform .2s ease',
        },
      },
    },

    MuiCardContent: {
      styleOverrides: {
        root: { padding: 20, '&:last-child': { paddingBottom: 20 } },
      },
    },

    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none' },
        outlined: { borderColor: p.divider },
      },
    },

    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: {
        root: {
          boxShadow: 'none',
          backgroundColor: alpha(p.background.paper, 0.85),
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${p.divider}`,
          color: p.text.primary,
        },
      },
    },

    MuiToolbar: {
      styleOverrides: {
        root: { minHeight: 64, '@media (min-width:600px)': { minHeight: 64 } },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: { borderRight: 'none', backgroundColor: drawerBg, backgroundImage: 'none' },
      },
    },

    MuiDialog: {
      defaultProps: { PaperProps: { elevation: 0 } },
      styleOverrides: {
        paper: {
          borderRadius: 28,
          backgroundImage: 'none',
          border: `1px solid ${p.divider}`,
        },
      },
    },

    MuiDialogTitle: {
      styleOverrides: {
        root: { fontSize: '1.25rem', fontWeight: 600, padding: '20px 24px 12px' },
      },
    },

    MuiDialogContent: {
      styleOverrides: { root: { padding: '8px 24px' } },
    },

    MuiDialogActions: {
      styleOverrides: { root: { padding: '16px 20px 20px', gap: 8 } },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
          height: 28,
          fontSize: '0.78rem',
        },
        sizeSmall: { height: 24, fontSize: '0.72rem' },
        outlined: { borderWidth: 1 },
      },
    },

    MuiTextField: {
      defaultProps: { variant: 'outlined' },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: 'transparent',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: p.divider },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha(p.primary.main, 0.5) },
        },
      },
    },

    MuiSelect: {
      styleOverrides: {
        outlined: { borderRadius: 12 },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 8, height: 6, backgroundColor: alpha(p.primary.main, 0.12) },
        bar: { borderRadius: 8 },
      },
    },

    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 40 },
        indicator: { borderRadius: 999, height: 3 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none' as const,
          fontWeight: 600,
          minHeight: 40,
          borderRadius: 12,
          letterSpacing: '0.005em',
        },
      },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          margin: '2px 12px',
          paddingLeft: 16,
          paddingRight: 16,
          '&.Mui-selected': {
            backgroundColor: alpha(p.primary.main, isDark ? 0.18 : 0.14),
            color: p.primary.main,
            '& .MuiListItemIcon-root': { color: p.primary.main },
            '&:hover': { backgroundColor: alpha(p.primary.main, isDark ? 0.24 : 0.20) },
          },
          '&:hover': { backgroundColor: alpha(p.primary.main, 0.08) },
        },
      },
    },

    MuiListItemIcon: {
      styleOverrides: {
        root: { minWidth: 40, color: p.text.secondary },
      },
    },

    MuiToggleButtonGroup: {
      styleOverrides: {
        root: {
          backgroundColor: alpha(p.primary.main, 0.06),
          borderRadius: 999,
          padding: 3,
          gap: 2,
          '& .MuiToggleButtonGroup-grouped': {
            margin: 0,
            border: 0,
            borderRadius: '999px !important',
          },
        },
      },
    },

    MuiToggleButton: {
      styleOverrides: {
        root: {
          border: 'none',
          color: p.text.secondary,
          textTransform: 'none' as const,
          fontWeight: 500,
          paddingInline: 14,
          paddingBlock: 6,
          minHeight: 32,
          '&.Mui-selected': {
            backgroundColor: alpha(p.primary.main, isDark ? 0.20 : 0.16),
            color: p.primary.main,
            '&:hover': { backgroundColor: alpha(p.primary.main, isDark ? 0.26 : 0.22) },
          },
        },
      },
    },

    MuiFab: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          textTransform: 'none' as const,
          fontWeight: 600,
          boxShadow: `0 1px 3px 0 ${alpha(p.primary.main, 0.20)}`,
          '&:hover': { boxShadow: `0 2px 6px 0 ${alpha(p.primary.main, 0.28)}` },
        },
        extended: { paddingInline: 20 },
      },
    },

    MuiSwitch: {
      styleOverrides: {
        root: { padding: 8, width: 56, height: 36 },
        track: { borderRadius: 22, opacity: 1, backgroundColor: alpha(p.text.primary, 0.18) },
        thumb: { boxShadow: 'none', width: 18, height: 18 },
        switchBase: {
          padding: 9,
          '&.Mui-checked': {
            transform: 'translateX(20px)',
            '& + .MuiSwitch-track': { opacity: 1, backgroundColor: p.primary.main },
            '& .MuiSwitch-thumb': { backgroundColor: '#fff' },
          },
        },
      },
    },

    MuiAvatar: {
      styleOverrides: {
        root: { fontWeight: 600, fontSize: '0.95rem' },
        rounded: { borderRadius: 12 },
      },
    },

    MuiAlert: {
      defaultProps: { variant: 'standard' },
      styleOverrides: {
        root: { borderRadius: 16, padding: '10px 16px' },
        standardSuccess: { backgroundColor: alpha(p.success.main, isDark ? 0.18 : 0.10) },
        standardWarning: { backgroundColor: alpha(p.warning.main, isDark ? 0.18 : 0.10) },
        standardError:   { backgroundColor: alpha(p.error.main, isDark ? 0.18 : 0.10) },
        standardInfo:    { backgroundColor: alpha(p.info.main, isDark ? 0.18 : 0.10) },
      },
    },

    MuiTooltip: {
      defaultProps: { arrow: false },
      styleOverrides: {
        tooltip: {
          backgroundColor: isDark ? '#322F38' : '#322F38',
          color: '#FFFFFF',
          fontSize: '0.72rem',
          fontWeight: 500,
          borderRadius: 8,
          padding: '6px 10px',
        },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: `1px solid ${p.divider}`, padding: '12px 16px' },
        head: { fontWeight: 600, fontSize: '0.78rem', color: p.text.secondary, textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
      },
    },

    MuiTableRow: {
      styleOverrides: {
        root: { '&:hover': { backgroundColor: alpha(p.primary.main, 0.04) } },
      },
    },

    MuiDivider: {
      styleOverrides: { root: { borderColor: p.divider } },
    },

    MuiCheckbox: {
      styleOverrides: {
        root: { color: p.text.secondary, '&.Mui-checked': { color: p.primary.main } },
      },
    },

    MuiRadio: {
      styleOverrides: {
        root: { color: p.text.secondary, '&.Mui-checked': { color: p.primary.main } },
      },
    },

    MuiSnackbarContent: {
      styleOverrides: {
        root: { borderRadius: 12, fontWeight: 500 },
      },
    },

    MuiBackdrop: {
      styleOverrides: {
        root: { backgroundColor: alpha(isDark ? '#000' : '#1D1B20', 0.5), backdropFilter: 'blur(2px)' },
      },
    },
  } as ThemeOptions['components']
}

export const lightTheme = createTheme({
  ...shared,
  palette: { mode: 'light', ...lightPalette },
  components: buildComponents('light'),
})

export const darkTheme = createTheme({
  ...shared,
  palette: { mode: 'dark', ...darkPalette },
  components: buildComponents('dark'),
})

export const MONO_FONT_FAMILY = MONO_FAMILY
