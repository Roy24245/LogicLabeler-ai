import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Button, Card, CardContent, CardActions, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, Grid, IconButton, TextField, Typography,
  MenuItem, Select, InputLabel, FormControl, Fab, useTheme, alpha, Avatar,
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import ImageRoundedIcon from '@mui/icons-material/ImageRounded'
import LabelRoundedIcon from '@mui/icons-material/LabelRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import FolderRoundedIcon from '@mui/icons-material/FolderRounded'
import { useDropzone } from 'react-dropzone'
import {
  getDatasets, createDataset, deleteDataset, importDataset, exportDataset,
  type Dataset,
} from '../api/client'
import { useStore } from '../store/useStore'
import PreprocessDialog from '../components/PreprocessDialog'

export default function Datasets() {
  const navigate = useNavigate()
  const theme = useTheme()
  const { datasets, setDatasets, showSnackbar } = useStore()
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importTarget, setImportTarget] = useState<number | null>(null)
  const [importFormat, setImportFormat] = useState('yolo')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [form, setForm] = useState({ name: '', description: '', task_type: 'detection' })
  const [exportPreprocessOpen, setExportPreprocessOpen] = useState(false)
  const [exportTargetId, setExportTargetId] = useState<number | null>(null)

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

  const handleExportClick = (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setExportTargetId(id)
    setExportPreprocessOpen(true)
  }

  const handleExportWithPreprocess = async (config: { augmentations: string[]; preprocessing: Record<string, any> }) => {
    setExportPreprocessOpen(false)
    if (!exportTargetId) return
    try {
      const { data } = await exportDataset(
        exportTargetId,
        config.augmentations.length > 0 ? config.augmentations : undefined,
        Object.keys(config.preprocessing).length > 0 ? config.preprocessing : undefined,
      )
      const url = window.URL.createObjectURL(new Blob([data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `dataset_${exportTargetId}_yolo.zip`
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
        <Fab
          variant="extended"
          color="primary"
          onClick={() => setCreateOpen(true)}
          sx={{ boxShadow: '0 2px 8px rgba(103,80,164,0.25)' }}
        >
          <AddRoundedIcon sx={{ mr: 1 }} />
          新建數據集
        </Fab>
      </Box>

      <Grid container spacing={2}>
        {datasets.map((ds) => (
          <Grid item xs={12} sm={6} md={4} key={ds.id}>
            <Card
              sx={{
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                  borderColor: 'primary.main',
                  transform: 'translateY(-2px)',
                  boxShadow: `0 4px 20px ${alpha(theme.palette.primary.main, 0.15)}`,
                },
              }}
              onClick={() => navigate(`/datasets/${ds.id}`)}
            >
              <CardContent sx={{ pb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                  <Avatar sx={{ bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main', width: 40, height: 40 }}>
                    <FolderRoundedIcon />
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600 }}>{ds.name}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {ds.description || '暫無描述'}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  <Chip icon={<ImageRoundedIcon />} label={`${ds.image_count} 圖片`} size="small" variant="outlined" />
                  <Chip icon={<LabelRoundedIcon />} label={`${ds.annotation_count} 標註`} size="small" variant="outlined" />
                  <Chip
                    icon={<CheckCircleRoundedIcon />}
                    label={`${ds.labeled_image_count ?? 0}/${ds.image_count}`}
                    size="small"
                    color={ds.labeled_image_count > 0 && ds.labeled_image_count >= ds.image_count ? 'success' : ds.labeled_image_count > 0 ? 'warning' : 'default'}
                    variant="outlined"
                  />
                </Box>
              </CardContent>
              <CardActions sx={{ justifyContent: 'flex-end', pt: 0 }}>
                <IconButton size="small" title="導入" onClick={(e) => { e.stopPropagation(); setImportTarget(ds.id); setImportOpen(true) }}>
                  <UploadFileRoundedIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" title="導出 YOLO" onClick={(e) => handleExportClick(ds.id, e)}>
                  <DownloadRoundedIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" title="刪除" onClick={(e) => handleDelete(ds.id, e)} color="error">
                  <DeleteRoundedIcon fontSize="small" />
                </IconButton>
              </CardActions>
            </Card>
          </Grid>
        ))}
        {datasets.length === 0 && (
          <Grid item xs={12}>
            <Box sx={{ textAlign: 'center', py: 10 }}>
              <Avatar sx={{ width: 72, height: 72, mx: 'auto', mb: 2, bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main' }}>
                <FolderRoundedIcon sx={{ fontSize: 36 }} />
              </Avatar>
              <Typography color="text.secondary">
                尚未創建任何數據集，點擊右上方按鈕開始
              </Typography>
            </Box>
          </Grid>
        )}
      </Grid>

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>創建新數據集</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="名稱" fullWidth required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField label="描述" fullWidth multiline rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <FormControl fullWidth>
            <InputLabel>任務類型</InputLabel>
            <Select label="任務類型" value={form.task_type} onChange={(e) => setForm({ ...form, task_type: e.target.value })}>
              <MenuItem value="detection">目標檢測</MenuItem>
              <MenuItem value="segmentation">實例分割</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleCreate}>創建</Button>
        </DialogActions>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>導入數據集</DialogTitle>
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
              borderRadius: 4,
              p: 4,
              textAlign: 'center',
              cursor: 'pointer',
              bgcolor: isDragActive ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
              transition: 'all 0.2s',
              '&:hover': { borderColor: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.04) },
            }}
          >
            <input {...getInputProps()} />
            <UploadFileRoundedIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
            <Typography>{importFile ? importFile.name : '拖拽 ZIP 文件到此處，或點擊選擇'}</Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setImportOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleImport} disabled={!importFile}>導入</Button>
        </DialogActions>
      </Dialog>

      <PreprocessDialog
        open={exportPreprocessOpen}
        onClose={() => setExportPreprocessOpen(false)}
        onConfirm={handleExportWithPreprocess}
        title="導出前預處理與增強"
        confirmLabel="導出數據集"
      />
    </Box>
  )
}
