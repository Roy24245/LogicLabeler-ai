import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import {
  Box, Button, Card, CardMedia, Chip, Dialog, DialogTitle, DialogContent,
  Grid, IconButton, Typography, CircularProgress, Tooltip,
} from '@mui/material'
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate'
import DeleteIcon from '@mui/icons-material/Delete'
import CloseIcon from '@mui/icons-material/Close'
import {
  getDataset, getImages, getAnnotations, uploadImages, deleteImage, updateAnnotations,
  type Dataset, type ImageItem, type AnnotationItem,
} from '../api/client'
import { useStore } from '../store/useStore'

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F']

export default function DatasetDetail() {
  const { id } = useParams<{ id: string }>()
  const datasetId = Number(id)
  const { showSnackbar } = useStore()
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [images, setImages] = useState<ImageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null)
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [dsRes, imgRes] = await Promise.all([getDataset(datasetId), getImages(datasetId, 0, 200)])
      setDataset(dsRes.data)
      setImages(imgRes.data)
    } catch { /* empty */ }
    setLoading(false)
  }, [datasetId])

  useEffect(() => { load() }, [load])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    try {
      await uploadImages(datasetId, files)
      showSnackbar(`已上傳 ${files.length} 張圖片`, 'success')
      load()
    } catch {
      showSnackbar('上傳失敗', 'error')
    }
  }

  const handleDelete = async (imgId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await deleteImage(imgId)
      showSnackbar('已刪除', 'success')
      load()
    } catch {
      showSnackbar('刪除失敗', 'error')
    }
  }

  const openAnnotator = async (img: ImageItem) => {
    setSelectedImage(img)
    try {
      const { data } = await getAnnotations(img.id)
      setAnnotations(data)
    } catch {
      setAnnotations([])
    }
  }

  useEffect(() => {
    if (!selectedImage || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      imgRef.current = image
      const scale = Math.min(canvas.width / image.width, canvas.height / image.height)
      const offsetX = (canvas.width - image.width * scale) / 2
      const offsetY = (canvas.height - image.height * scale) / 2
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, offsetX, offsetY, image.width * scale, image.height * scale)

      const classColors: Record<string, string> = {}
      let colorIdx = 0
      annotations.forEach((ann) => {
        if (!ann.bbox) return
        if (!classColors[ann.class_name]) {
          classColors[ann.class_name] = COLORS[colorIdx % COLORS.length]
          colorIdx++
        }
        const color = classColors[ann.class_name]
        const { x, y, w, h } = ann.bbox
        const sx = x * scale + offsetX
        const sy = y * scale + offsetY
        const sw = w * scale
        const sh = h * scale

        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.strokeRect(sx, sy, sw, sh)

        ctx.fillStyle = color
        ctx.globalAlpha = 0.15
        ctx.fillRect(sx, sy, sw, sh)
        ctx.globalAlpha = 1

        const label = `${ann.class_name}${ann.confidence ? ` ${(ann.confidence * 100).toFixed(0)}%` : ''}`
        ctx.font = '13px Inter, sans-serif'
        const tw = ctx.measureText(label).width
        ctx.fillStyle = color
        ctx.fillRect(sx, sy - 20, tw + 8, 20)
        ctx.fillStyle = '#fff'
        ctx.fillText(label, sx + 4, sy - 5)
      })
    }
    image.src = selectedImage.url
  }, [selectedImage, annotations])

  const handleDeleteAnnotation = async (annId: number) => {
    const updated = annotations.filter((a) => a.id !== annId)
    try {
      await updateAnnotations(selectedImage!.id, updated.map(a => ({
        class_name: a.class_name,
        bbox: a.bbox,
        confidence: a.confidence,
        source: a.source,
      })))
      setAnnotations(updated)
      showSnackbar('標註已更新', 'success')
    } catch {
      showSnackbar('更新失敗', 'error')
    }
  }

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">{dataset?.name || '數據集'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {dataset?.image_count} 張圖片 / {dataset?.annotation_count} 個標註
          </Typography>
        </Box>
        <Button variant="contained" component="label" startIcon={<AddPhotoAlternateIcon />}>
          上傳圖片
          <input type="file" hidden multiple accept="image/*" onChange={handleUpload} />
        </Button>
      </Box>

      {dataset?.label_classes && dataset.label_classes.length > 0 && (
        <Box sx={{ mb: 3, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ mr: 1, lineHeight: '32px' }}>標籤類別:</Typography>
          {dataset.label_classes.map((cls, i) => (
            <Chip key={cls} label={cls} size="small" sx={{ bgcolor: COLORS[i % COLORS.length] + '33' }} />
          ))}
        </Box>
      )}

      <Grid container spacing={2}>
        {images.map((img) => (
          <Grid item xs={6} sm={4} md={3} lg={2} key={img.id}>
            <Card
              sx={{
                cursor: 'pointer',
                '&:hover': { transform: 'scale(1.02)', borderColor: 'primary.main' },
                transition: '0.2s',
                position: 'relative',
              }}
              onClick={() => openAnnotator(img)}
            >
              <CardMedia
                component="img"
                height={140}
                image={img.url}
                alt={img.filename}
                sx={{ objectFit: 'cover' }}
              />
              <Box sx={{ p: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" noWrap sx={{ maxWidth: 100 }}>{img.filename}</Typography>
                <IconButton size="small" onClick={(e) => handleDelete(img.id, e)} color="error">
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
              {img.is_augmented && (
                <Chip label="增強" size="small" color="secondary"
                  sx={{ position: 'absolute', top: 4, right: 4, fontSize: 10 }} />
              )}
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Annotation Viewer Dialog */}
      <Dialog open={!!selectedImage} onClose={() => setSelectedImage(null)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between' }}>
          {selectedImage?.filename}
          <IconButton onClick={() => setSelectedImage(null)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={8}>
              <canvas
                ref={canvasRef}
                width={800}
                height={600}
                style={{ width: '100%', height: 'auto', borderRadius: 8, background: '#000' }}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography variant="h6" gutterBottom>標註列表 ({annotations.length})</Typography>
              <Box sx={{ maxHeight: 500, overflow: 'auto' }}>
                {annotations.map((ann, i) => (
                  <Card key={ann.id} sx={{ mb: 1, p: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Chip
                          label={ann.class_name} size="small"
                          sx={{ bgcolor: COLORS[i % COLORS.length] + '33', mb: 0.5 }}
                        />
                        <Typography variant="caption" display="block" color="text.secondary">
                          {ann.source} {ann.confidence ? `| ${(ann.confidence * 100).toFixed(1)}%` : ''}
                        </Typography>
                      </Box>
                      <Tooltip title="刪除此標註">
                        <IconButton size="small" onClick={() => handleDeleteAnnotation(ann.id)} color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Card>
                ))}
                {annotations.length === 0 && (
                  <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                    暫無標註
                  </Typography>
                )}
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
      </Dialog>
    </Box>
  )
}
