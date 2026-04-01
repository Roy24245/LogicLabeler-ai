import { create } from 'zustand'
import type { Dataset, Settings } from '../api/client'

interface AppState {
  datasets: Dataset[]
  setDatasets: (ds: Dataset[]) => void

  settings: Settings | null
  setSettings: (s: Settings) => void

  sidebarOpen: boolean
  toggleSidebar: () => void

  snackbar: { open: boolean; message: string; severity: 'success' | 'error' | 'info' }
  showSnackbar: (message: string, severity?: 'success' | 'error' | 'info') => void
  closeSnackbar: () => void
}

export const useStore = create<AppState>((set) => ({
  datasets: [],
  setDatasets: (datasets) => set({ datasets }),

  settings: null,
  setSettings: (settings) => set({ settings }),

  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  snackbar: { open: false, message: '', severity: 'info' },
  showSnackbar: (message, severity = 'info') =>
    set({ snackbar: { open: true, message, severity } }),
  closeSnackbar: () =>
    set((s) => ({ snackbar: { ...s.snackbar, open: false } })),
}))
