import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  alpha, Avatar, Box, Button, Card, CardMedia, Checkbox, Chip, CircularProgress,
  Dialog, DialogTitle, DialogContent, Grid, IconButton, Menu, MenuItem,
  Pagination, Select, Slider, Tab, Tabs, TextField, Tooltip, Typography, useTheme,
} from '@mui/material'
import AddPhotoAlternateRoundedIcon from '@mui/icons-material/AddPhotoAlternateRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import SelectAllRoundedIcon from '@mui/icons-material/SelectAllRounded'
import FolderRoundedIcon from '@mui/icons-material/FolderRounded'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import DeleteForeverRoundedIcon from '@mui/icons-material/DeleteForeverRounded'
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded'
import { useDropzone } from 'react-dropzone'
import {
  getDataset, getImages, uploadImages, deleteImage,
  batchDeleteImages, getDatasetStats, autoSplit, batchSplit, convertImagesToJpg,
  deleteDataset, exportDataset,
  type Dataset, type ImageItem, type DatasetStats as StatsType,
} from '../api/client'
import { useStore } from '../store/useStore'
import ClassManager from '../components/ClassManager'
import DatasetStatsPanel from '../components/DatasetStats'
import KeypointSchemaEditor from '../components/KeypointSchemaEditor'
import PreprocessDialog from '../components/PreprocessDialog'
import PageHeader from '../components/PageHeader'
import { AnnotatorDialog } from '../components/Annotator'

const PAGE_SIZE = 50

const SPLIT_CHIP: Record<string, { label: string; color: 'info' | 'warning' | 'error' | 'default' }> = {
  train: { label: 'Train', color: 'info' },
  val: { label: 'Val', color: 'warning' },
  test: { label: 'Test', color: 'error' },
}

export default function DatasetDetail() {
  const { id } = useParams<{ id: string }>()
  const datasetId = Number(id)
  const navigate = useNavigate()
  const { showSnackbar } = useStore()
  const theme = useTheme()

  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingDataset, setDeletingDataset] = useState(false)

  const [tab, setTab] = useState(0)
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [stats, setStats] = useState<StatsType | null>(null)
  const [loading, setLoading] = useState(true)

  const [images, setImages] = useState<ImageItem[]>([])
  const [totalImages, setTotalImages] = useState(0)
  const [page, setPage] = useState(1)
  const [filterLabeled, setFilterLabeled] = useState<string>('all')
  const [filterClass, setFilterClass] = useState('')
  const [filterSplit, setFilterSplit] = useState('')
  const [filterVerified, setFilterVerified] = useState('all')
  const [searchText, setSearchText] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchMenuAnchor, setBatchMenuAnchor] = useState<HTMLElement | null>(null)

  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null)
  const [selectedImageIdx, setSelectedImageIdx] = useState(-1)

  const [splitRatios, setSplitRatios] = useState([70, 20, 10])

  const loadDataset = useCallback(async () => { try { const { data } = await getDataset(datasetId); setDataset(data) } catch {} }, [datasetId])
  const loadStats = useCallback(async () => { try { const { data } = await getDatasetStats(datasetId); setStats(data) } catch {} }, [datasetId])
  const loadImages = useCallback(async () => {
    setLoading(true)
    try {
      const filters: Record<string, any> = {}
      if (filterLabeled === 'labeled') filters.labeled = true
      if (filterLabeled === 'unlabeled') filters.labeled = false
      if (filterClass) filters.class_name = filterClass
      if (filterSplit) filters.split = filterSplit
      if (searchText) filters.search = searchText
      const { data } = await getImages(datasetId, (page - 1) * PAGE_SIZE, PAGE_SIZE, filters)
      let imgs = data.images
      if (filterVerified === 'verified') imgs = imgs.filter(i => i.verified)
      else if (filterVerified === 'unverified') imgs = imgs.filter(i => !i.verified)
      setImages(imgs)
      setTotalImages(data.total)
    } catch {}
    setLoading(false)
  }, [datasetId, page, filterLabeled, filterClass, filterSplit, filterVerified, searchText])

  const refreshAll = useCallback(async () => { await Promise.all([loadDataset(), loadImages(), loadStats()]) }, [loadDataset, loadImages, loadStats])
  useEffect(() => { loadDataset(); loadStats() }, [loadDataset, loadStats])
  useEffect(() => { loadImages() }, [loadImages])

  const onDrop = useCallback(async (files: File[]) => {
    if (!files.length) return
    try { await uploadImages(datasetId, files); showSnackbar(`已上傳 ${files.length} 張圖片`, 'success'); refreshAll() }
    catch { showSnackbar('上傳失敗', 'error') }
  }, [datasetId, showSnackbar, refreshAll])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'image/*': [] }, noClick: true })
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => { const files = Array.from(e.target.files || []); if (files.length) onDrop(files); e.target.value = '' }

  const toggleSelect = (imgId: number) => { setSelectedIds(prev => { const next = new Set(prev); if (next.has(imgId)) next.delete(imgId); else next.add(imgId); return next }) }
  const selectAll = () => { if (selectedIds.size === images.length) setSelectedIds(new Set()); else setSelectedIds(new Set(images.map(i => i.id))) }
  const handleBatchDelete = async () => {
    if (!selectedIds.size || !confirm(`確定刪除 ${selectedIds.size} 張圖片？`)) return
    try { await batchDeleteImages(datasetId, Array.from(selectedIds)); setSelectedIds(new Set()); showSnackbar('批量刪除完成', 'success'); refreshAll() }
    catch { showSnackbar('刪除失敗', 'error') }
  }
  const handleBatchSplit = async (splitVal: string | null) => {
    if (!selectedIds.size) return
    try { await batchSplit(datasetId, Array.from(selectedIds), splitVal); setBatchMenuAnchor(null); setSelectedIds(new Set()); showSnackbar('分割指定完成', 'success'); refreshAll() }
    catch { showSnackbar('操作失敗', 'error') }
  }
  const handleAutoSplit = async () => {
    try { await autoSplit(datasetId, splitRatios[0] / 100, splitRatios[1] / 100, splitRatios[2] / 100); showSnackbar('自動分割完成', 'success'); refreshAll() }
    catch { showSnackbar('分割失敗', 'error') }
  }

  const handleSaveDataset = () => setExportDialogOpen(true)

  const handleExportWithPreprocess = async (config: { augmentations: string[]; preprocessing: Record<string, any> }) => {
    setExportDialogOpen(false)
    setExporting(true)
    try {
      const { data } = await exportDataset(
        datasetId,
        config.augmentations.length > 0 ? config.augmentations : undefined,
        Object.keys(config.preprocessing).length > 0 ? config.preprocessing : undefined,
      )
      const url = window.URL.createObjectURL(new Blob([data]))
      const a = document.createElement('a')
      a.href = url
      const safeName = (dataset?.name || `dataset_${datasetId}`).replace(/[^\w\-]+/g, '_')
      a.download = `${safeName}_yolo.zip`
      a.click()
      window.URL.revokeObjectURL(url)
      showSnackbar('數據集已保存到本地', 'success')
    } catch { showSnackbar('保存失敗', 'error') }
    finally { setExporting(false) }
  }

  const handleDeleteDataset = async () => {
    setDeletingDataset(true)
    try {
      await deleteDataset(datasetId)
      showSnackbar('數據集已刪除', 'success')
      navigate('/datasets')
    } catch {
      showSnackbar('刪除失敗', 'error')
      setDeletingDataset(false)
      setDeleteConfirmOpen(false)
    }
  }

  const openAnnotator = (img: ImageItem, idx: number) => {
    setSelectedImage(img)
    setSelectedImageIdx(idx)
  }
  const closeAnnotator = () => {
    setSelectedImage(null)
    setSelectedImageIdx(-1)
    loadImages()
  }
  const navigateImage = (dir: number) => {
    const newIdx = selectedImageIdx + dir
    if (newIdx < 0 || newIdx >= images.length) return
    setSelectedImage(images[newIdx])
    setSelectedImageIdx(newIdx)
  }

  const pageCount = useMemo(() => Math.ceil(totalImages / PAGE_SIZE), [totalImages])

  return (
    <Box>
      <PageHeader
        icon={<FolderRoundedIcon />}
        title={dataset?.name || '數據集'}
        subtitle={dataset ? `${dataset.image_count} 張圖片 · ${dataset.annotation_count} 個標註 · ${dataset.labeled_image_count}/${dataset.image_count} 已標註` : ''}
        actions={
          <>
            <Button variant="contained" component="label" startIcon={<AddPhotoAlternateRoundedIcon />}>
              上傳圖片
              <input type="file" hidden multiple accept="image/*" onChange={handleUpload} />
            </Button>
            <Button
              variant="outlined"
              startIcon={<DownloadRoundedIcon />}
              onClick={handleSaveDataset}
              disabled={exporting}
            >
              {exporting ? '保存中...' : '保存數據集'}
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteForeverRoundedIcon />}
              onClick={() => setDeleteConfirmOpen(true)}
            >
              刪除數據集
            </Button>
          </>
        }
      />

      <Tabs
        value={tab} onChange={(_, v) => setTab(v)}
        sx={{ mb: 2, '& .Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.08) } }}
      >
        <Tab label="圖片" />
        <Tab label="統計" />
        <Tab label="設定" />
      </Tabs>

      {tab === 0 && (
        <Box {...getRootProps()}>
          {isDragActive && (
            <Box sx={{ position: 'fixed', inset: 0, zIndex: 9999, bgcolor: alpha(theme.palette.primary.main, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', backdropFilter: 'blur(4px)' }}>
              <Typography variant="h4" color="primary">拖放圖片上傳</Typography>
            </Box>
          )}
          <input {...getInputProps()} />

          <Card sx={{ p: 1.5, mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Select size="small" value={filterLabeled} onChange={(e) => { setFilterLabeled(e.target.value); setPage(1) }} sx={{ minWidth: 100 }}>
                <MenuItem value="all">全部</MenuItem>
                <MenuItem value="labeled">已標註</MenuItem>
                <MenuItem value="unlabeled">未標註</MenuItem>
              </Select>
              <Select size="small" value={filterVerified} onChange={(e) => { setFilterVerified(e.target.value) }} sx={{ minWidth: 100 }}>
                <MenuItem value="all">驗證</MenuItem>
                <MenuItem value="verified">已驗證</MenuItem>
                <MenuItem value="unverified">未驗證</MenuItem>
              </Select>
              <Select size="small" value={filterSplit} onChange={(e) => { setFilterSplit(e.target.value); setPage(1) }} displayEmpty sx={{ minWidth: 100 }}>
                <MenuItem value="">所有分割</MenuItem>
                <MenuItem value="train">Train</MenuItem>
                <MenuItem value="val">Val</MenuItem>
                <MenuItem value="test">Test</MenuItem>
                <MenuItem value="unassigned">未分配</MenuItem>
              </Select>
              {dataset?.label_classes && dataset.label_classes.length > 0 && (
                <Select size="small" value={filterClass} onChange={(e) => { setFilterClass(e.target.value); setPage(1) }} displayEmpty sx={{ minWidth: 120 }}>
                  <MenuItem value="">所有類別</MenuItem>
                  {dataset.label_classes.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              )}
              <TextField size="small" placeholder="搜索檔名..." value={searchText} onChange={(e) => { setSearchText(e.target.value); setPage(1) }}
                InputProps={{ startAdornment: <SearchRoundedIcon fontSize="small" sx={{ mr: 0.5, color: 'text.secondary' }} /> }} sx={{ width: 200 }} />
              <Box sx={{ flex: 1 }} />
              <Tooltip title="全選"><IconButton size="small" onClick={selectAll}><SelectAllRoundedIcon fontSize="small" color={selectedIds.size === images.length && images.length > 0 ? 'primary' : 'inherit'} /></IconButton></Tooltip>
              <Typography variant="body2" color="text.secondary">{totalImages} 張</Typography>
            </Box>
          </Card>

          {selectedIds.size > 0 && (
            <Card sx={{ p: 1.5, mb: 2, bgcolor: alpha(theme.palette.primary.main, 0.06) }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Chip label={`已選 ${selectedIds.size} 張`} color="primary" size="small" />
                <Button size="small" color="error" startIcon={<DeleteRoundedIcon />} onClick={handleBatchDelete}>批量刪除</Button>
                <Button size="small" onClick={(e) => setBatchMenuAnchor(e.currentTarget)}>指定分割</Button>
                <Menu anchorEl={batchMenuAnchor} open={!!batchMenuAnchor} onClose={() => setBatchMenuAnchor(null)}>
                  <MenuItem onClick={() => handleBatchSplit('train')}>Train</MenuItem>
                  <MenuItem onClick={() => handleBatchSplit('val')}>Val</MenuItem>
                  <MenuItem onClick={() => handleBatchSplit('test')}>Test</MenuItem>
                  <MenuItem onClick={() => handleBatchSplit(null)}>取消分配</MenuItem>
                </Menu>
                <Button size="small" onClick={() => setSelectedIds(new Set())}>取消選擇</Button>
              </Box>
            </Card>
          )}

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
          ) : (
            <>
              <Grid container spacing={1.5}>
                {images.map((img, idx) => (
                  <Grid item xs={6} sm={4} md={3} lg={2} key={img.id}>
                    <Card
                      sx={{
                        cursor: 'pointer', transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
                        border: selectedIds.has(img.id) ? `2px solid ${theme.palette.primary.main}` : `1px solid ${theme.palette.divider}`,
                        '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.1)}` },
                      }}
                      onClick={() => openAnnotator(img, idx)}
                    >
                      <CardMedia component="img" height={130} image={img.url} alt={img.filename} sx={{ objectFit: 'cover' }} />
                      <Box sx={{ p: 0.75, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="caption" noWrap sx={{ maxWidth: 90, fontSize: 11 }}>{img.filename}</Typography>
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); deleteImage(img.id).then(() => refreshAll()) }} color="error" sx={{ p: 0.3 }}>
                          <DeleteRoundedIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Box>
                      <Chip label={img.annotation_count > 0 ? `${img.annotation_count}` : '---'} size="small"
                        color={img.annotation_count > 0 ? 'success' : 'default'}
                        sx={{ position: 'absolute', top: 4, left: 4, fontSize: 10, height: 20, borderRadius: 2 }} />
                      {img.split && SPLIT_CHIP[img.split] && (
                        <Chip label={SPLIT_CHIP[img.split].label} size="small" color={SPLIT_CHIP[img.split].color}
                          sx={{ position: 'absolute', top: 4, right: 4, fontSize: 10, height: 20, borderRadius: 2 }} />
                      )}
                      {img.verified && (
                        <Tooltip title="已驗證">
                          <VerifiedRoundedIcon sx={{ position: 'absolute', top: 28, right: 4, fontSize: 18, color: theme.palette.success.main, bgcolor: 'rgba(255,255,255,0.85)', borderRadius: '50%' }} />
                        </Tooltip>
                      )}
                      <Checkbox size="small" checked={selectedIds.has(img.id)}
                        onClick={(e) => { e.stopPropagation(); toggleSelect(img.id) }}
                        sx={{ position: 'absolute', bottom: 24, right: 0, p: 0.3 }} />
                    </Card>
                  </Grid>
                ))}
              </Grid>
              {pageCount > 1 && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}><Pagination count={pageCount} page={page} onChange={(_, v) => setPage(v)} color="primary" shape="rounded" /></Box>}
              {images.length === 0 && !loading && (
                <Box sx={{ textAlign: 'center', py: 10 }}>
                  <Avatar sx={{ width: 72, height: 72, mx: 'auto', mb: 2, bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main' }}>
                    <AddPhotoAlternateRoundedIcon sx={{ fontSize: 36 }} />
                  </Avatar>
                  <Typography color="text.secondary">拖拽圖片到此處或點擊上傳按鈕</Typography>
                </Box>
              )}
            </>
          )}
        </Box>
      )}

      {tab === 1 && (stats ? <DatasetStatsPanel stats={stats} /> : <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>)}

      {tab === 2 && dataset && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card sx={{ p: 2.5 }}>
              <ClassManager dataset={dataset} stats={stats} onRefresh={refreshAll} />
            </Card>
            <Card sx={{ p: 2.5, mt: 2 }}>
              <KeypointSchemaEditor dataset={dataset} onRefresh={refreshAll} onSnackbar={showSnackbar} />
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card sx={{ p: 2.5 }}>
              <Typography variant="h6" gutterBottom>數據分割</Typography>
              {stats && <Box sx={{ mb: 2, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {Object.entries(stats.split_distribution).map(([k, v]) => (
                  <Chip key={k} label={`${k === 'unassigned' ? '未分配' : k}: ${v}`} color={SPLIT_CHIP[k]?.color || 'default'} size="small" variant="outlined" />
                ))}
              </Box>}
              <Typography variant="body2" color="text.secondary" gutterBottom>自動隨機分割</Typography>
              <Box sx={{ px: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="caption">Train: {splitRatios[0]}%</Typography>
                  <Typography variant="caption">Val: {splitRatios[1]}%</Typography>
                  <Typography variant="caption">Test: {splitRatios[2]}%</Typography>
                </Box>
                <Slider value={splitRatios[0]} min={10} max={90} step={5}
                  onChange={(_, v) => { const train = v as number; const remaining = 100 - train; const val = Math.min(splitRatios[1], remaining - 5); setSplitRatios([train, Math.max(5, val), remaining - Math.max(5, val)]) }} sx={{ mb: 1 }} />
                <Slider value={splitRatios[1]} min={5} max={100 - splitRatios[0] - 5} step={5}
                  onChange={(_, v) => { const val = v as number; setSplitRatios([splitRatios[0], val, 100 - splitRatios[0] - val]) }} color="secondary" />
              </Box>
              <Button variant="contained" onClick={handleAutoSplit} sx={{ mt: 2 }} fullWidth>執行自動分割</Button>
            </Card>
            <Card sx={{ p: 2.5, mt: 2 }}>
              <Typography variant="h6" gutterBottom>數據集資訊</Typography>
              <TextField fullWidth label="名稱" size="small" value={dataset.name} sx={{ mb: 2 }} disabled />
              <TextField fullWidth label="描述" size="small" multiline rows={2} value={dataset.description || ''} sx={{ mb: 2 }} disabled />
              <Typography variant="body2" color="text.secondary">類型: {dataset.task_type} · 創建: {dataset.created_at ? new Date(dataset.created_at).toLocaleDateString() : '-'}</Typography>
            </Card>
            <Card sx={{ p: 2.5, mt: 2 }}>
              <Typography variant="h6" gutterBottom>圖片格式</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>將非 JPG 格式圖片統一轉換為 JPEG。</Typography>
              <Button variant="outlined" fullWidth onClick={async () => {
                try { const res = await convertImagesToJpg(datasetId); showSnackbar(`轉換完成，共 ${res.data.converted} 張`, 'success'); refreshAll() }
                catch { showSnackbar('轉換失敗', 'error') }
              }}>轉換所有圖片為 JPG</Button>
            </Card>
          </Grid>
        </Grid>
      )}

      <AnnotatorDialog
        open={!!selectedImage}
        dataset={dataset}
        images={images}
        selectedImage={selectedImage}
        selectedImageIdx={selectedImageIdx}
        onNavigate={navigateImage}
        onClose={closeAnnotator}
        onSnackbar={showSnackbar}
        onImagesShouldRefresh={loadImages}
      />

      <PreprocessDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        onConfirm={handleExportWithPreprocess}
        title="保存數據集 — 預處理與增強"
        confirmLabel="保存到本地"
      />

      <Dialog
        open={deleteConfirmOpen}
        onClose={() => !deletingDataset && setDeleteConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 4 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar sx={{ bgcolor: alpha(theme.palette.error.main, 0.12), color: 'error.main' }}>
            <DeleteForeverRoundedIcon />
          </Avatar>
          確認刪除數據集
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            您即將刪除數據集「<strong>{dataset?.name}</strong>」。此操作將永久移除：
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0, color: 'text.secondary' }}>
            <Box component="li"><Typography variant="body2">{dataset?.image_count ?? 0} 張圖片</Typography></Box>
            <Box component="li"><Typography variant="body2">{dataset?.annotation_count ?? 0} 個標註</Typography></Box>
            <Box component="li"><Typography variant="body2">所有相關訓練任務記錄</Typography></Box>
          </Box>
          <Typography variant="body2" color="error" sx={{ mt: 2, fontWeight: 500 }}>
            此操作無法復原，建議先「保存數據集」備份。
          </Typography>
        </DialogContent>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirmOpen(false)} disabled={deletingDataset}>取消</Button>
          <Button
            variant="contained"
            color="error"
            startIcon={<DeleteForeverRoundedIcon />}
            onClick={handleDeleteDataset}
            disabled={deletingDataset}
          >
            {deletingDataset ? '刪除中...' : '確認刪除'}
          </Button>
        </Box>
      </Dialog>
    </Box>
  )
}
