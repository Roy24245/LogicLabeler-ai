import { Routes, Route, Navigate } from 'react-router-dom'
import { Snackbar, Alert } from '@mui/material'
import Layout from './components/Layout/Layout'
import Dashboard from './pages/Dashboard'
import Datasets from './pages/Datasets'
import DatasetDetail from './pages/DatasetDetail'
import AutoLabel from './pages/AutoLabel'
import Training from './pages/Training'
import Augmentation from './pages/Augmentation'
import Settings from './pages/Settings'
import { useStore } from './store/useStore'

export default function App() {
  const { snackbar, closeSnackbar } = useStore()

  return (
    <>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/datasets" element={<Datasets />} />
          <Route path="/datasets/:id" element={<DatasetDetail />} />
          <Route path="/auto-label" element={<AutoLabel />} />
          <Route path="/training" element={<Training />} />
          <Route path="/augmentation" element={<Augmentation />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={closeSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={closeSnackbar} severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  )
}
