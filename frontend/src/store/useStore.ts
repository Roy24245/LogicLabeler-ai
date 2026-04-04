import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Dataset, Settings } from '../api/client'

type ThemeMode = 'light' | 'dark' | 'system'

interface AppState {
  datasets: Dataset[]
  setDatasets: (ds: Dataset[]) => void

  settings: Settings | null
  setSettings: (s: Settings) => void

  sidebarOpen: boolean
  toggleSidebar: () => void

  themeMode: ThemeMode
  setThemeMode: (mode: ThemeMode) => void

  snackbar: { open: boolean; message: string; severity: 'success' | 'error' | 'info' }
  showSnackbar: (message: string, severity?: 'success' | 'error' | 'info') => void
  closeSnackbar: () => void
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      datasets: [],
      setDatasets: (datasets) => set({ datasets }),

      settings: null,
      setSettings: (settings) => set({ settings }),

      sidebarOpen: true,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      themeMode: 'system',
      setThemeMode: (themeMode) => set({ themeMode }),

      snackbar: { open: false, message: '', severity: 'info' },
      showSnackbar: (message, severity = 'info') =>
        set({ snackbar: { open: true, message, severity } }),
      closeSnackbar: () =>
        set((s) => ({ snackbar: { ...s.snackbar, open: false } })),
    }),
    {
      name: 'logiclabeler-store',
      partialize: (state) => ({ themeMode: state.themeMode, sidebarOpen: state.sidebarOpen }),
    },
  ),
)
