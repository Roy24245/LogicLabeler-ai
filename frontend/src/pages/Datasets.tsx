import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Button, Card, CardContent, CardActions, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, Grid, IconButton, TextField, Typography,
  MenuItem, Select, InputLabel, FormControl,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import DeleteIcon from '@mui/icons-material/Delete'
import DownloadIcon from '@mui/icons-material/Download'
import ImageIcon from '@mui/icons-material/Image'
import LabelIcon from '@mui/icons-material/Label'
import { useDropzone } from 'react-dropzone'
import {
  getDatasets, createDataset, deleteDataset, importDataset, exportDataset,
  type Dataset,
} from '../api/client'
import { useStore } from '../store/useStore'

export default function Datasets() {
  const navigate = useNavigate()
  const { datasets, setDatasets, showSnackbar } = useStore()
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importTarget, setImportTarget] = useState<number | null>(null)
  const [importFormat, setImportFormat] = useState('yolo')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [form, setForm] = useState({ name: '', description: '', task_type: 'detection' })

  const load = useCallback(async () => {
    try {
      const { data } = await getDatasets()
      setDatasets(data)
    } catch { /* empty */ }
  }, [setDatasets])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!form.name.trim()) return
    try {
      await createDataset(form)
      setCreateOpen(false)
      setForm({ name: '', description: '', task_type: 'detection' })
      showSnackbar('數據集已創建', 'success')
      load()
    } catch {
      showSnackbar('創建失敗', 'error')
    }
  }

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('確定刪除此數據集？')) return
    try {
      await deleteDataset(id)
      showSnackbar('已刪除', 'success')
      load()
    } catch {
      showSnackbar('刪除失敗', 'error')
    }
  }

  const handleExport = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const { data } = await exportDataset(id)
      const url = window.URL.createObjectURL(new Blob([data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `dataset_${id}_yolo.zip`
      a.click()
      window.URL.revokeObjectURL(url)
      showSnackbar('導出完成', 'success')
    } catch {
      showSnackbar('導出失敗', 'error')
    }
  }

  const handleImport = async () => {
    if (!importTarget || !importFile) return
    try {
      await importDataset(importTarget, importFile, importFormat)
      setImportOpen(false)
      setImportFile(null)
      showSnackbar('導入成功', 'success')
      load()
    } catch {
      showSnackbar('導入失敗', 'error')
    }
  }

  const onDrop = useCallback((files: File[]) => {
    if (files.length) setImportFile(files[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/zip': ['.zip'] },
    maxFiles: 1,
  })

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">數據集管理</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          創建數據集
        </Button>
      </Box>

      <Grid container spacing={3}>
        {datasets.map((ds) => (
          <Grid item xs={12} sm={6} md={4} key={ds.id}>
            <Card
              sx={{ cursor: 'pointer', '&:hover': { borderColor: 'primary.main' }, transition: '0.2s' }}
              onClick={() => navigate(`/datasets/${ds.id}`)}
            >
              <CardContent>
                <Typography variant="h6" gutterBottom noWrap>{ds.name}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 40 }}>
                  {ds.description || '暫無描述'}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Chip icon={<ImageIcon />} label={`${ds.image_count} 張圖片`} size="small" />
                  <Chip icon={<LabelIcon />} label={`${ds.annotation_count} 標註`} size="small" />
                  <Chip label={ds.task_type} size="small" variant="outlined" />
                </Box>
              </CardContent>
              <CardActions sx={{ justifyContent: 'flex-end' }}>
                <IconButton
                  size="small"
                  title="導入"
                  onClick={(e) => { e.stopPropagation(); setImportTarget(ds.id); setImportOpen(true) }}
                >
                  <UploadFileIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" title="導出 YOLO" onClick={(e) => handleExport(ds.id, e)}>
                  <DownloadIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" title="刪除" onClick={(e) => handleDelete(ds.id, e)} color="error">
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </CardActions>
            </Card>
          </Grid>
        ))}
        {datasets.length === 0 && (
          <Grid item xs={12}>
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <StorageIconEmpty />
              <Typography color="text.secondary" sx={{ mt: 2 }}>
                尚未創建任何數據集，點擊上方按鈕開始
              </Typography>
            </Box>
          </Grid>
        )}
      </Grid>

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>創建新數據集</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="名稱" fullWidth required
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <TextField
            label="描述" fullWidth multiline rows={2}
            value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <FormControl fullWidth>
            <InputLabel>任務類型</InputLabel>
            <Select
              label="任務類型"
              value={form.task_type}
              onChange={(e) => setForm({ ...form, task_type: e.target.value })}
            >
              <MenuItem value="detection">目標檢測</MenuItem>
              <MenuItem value="segmentation">實例分割</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleCreate}>創建</Button>
        </DialogActions>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>導入數據集</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <FormControl fullWidth>
            <InputLabel>格式</InputLabel>
            <Select label="格式" value={importFormat} onChange={(e) => setImportFormat(e.target.value)}>
              <MenuItem value="yolo">YOLO</MenuItem>
              <MenuItem value="coco">COCO</MenuItem>
              <MenuItem value="voc">Pascal VOC</MenuItem>
            </Select>
          </FormControl>
          <Box
            {...getRootProps()}
            sx={{
              border: '2px dashed',
              borderColor: isDragActive ? 'primary.main' : 'divider',
              borderRadius: 2,
              p: 4,
              textAlign: 'center',
              cursor: 'pointer',
              '&:hover': { borderColor: 'primary.main' },
            }}
          >
            <input {...getInputProps()} />
            <UploadFileIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
            <Typography>
              {importFile ? importFile.name : '拖拽 ZIP 文件到此處，或點擊選擇'}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleImport} disabled={!importFile}>導入</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function StorageIconEmpty() {
  return (
    <Box sx={{ display: 'inline-flex', p: 2, borderRadius: '50%', bgcolor: 'action.hover' }}>
      <UploadFileIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
    </Box>
  )
}
