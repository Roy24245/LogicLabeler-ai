import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  Autocomplete, Box, Button, Card, CardMedia, Checkbox, Chip, Dialog, DialogTitle,
  DialogContent, Divider, Grid, IconButton, MenuItem, Pagination, Select, Slider,
  Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
  CircularProgress, Menu, useTheme, alpha, Avatar,
} from '@mui/material'
import AddPhotoAlternateRoundedIcon from '@mui/icons-material/AddPhotoAlternateRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import GestureRoundedIcon from '@mui/icons-material/GestureRounded'
import UndoRoundedIcon from '@mui/icons-material/UndoRounded'
import RedoRoundedIcon from '@mui/icons-material/RedoRounded'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import WarningRoundedIcon from '@mui/icons-material/WarningRounded'
import CancelRoundedIcon from '@mui/icons-material/CancelRounded'
import NavigateBeforeRoundedIcon from '@mui/icons-material/NavigateBeforeRounded'
import NavigateNextRoundedIcon from '@mui/icons-material/NavigateNextRounded'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import ContentPasteRoundedIcon from '@mui/icons-material/ContentPasteRounded'
import BrightnessHighRoundedIcon from '@mui/icons-material/BrightnessHighRounded'
import ContrastRoundedIcon from '@mui/icons-material/ContrastRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import SelectAllRoundedIcon from '@mui/icons-material/SelectAllRounded'
import FitScreenRoundedIcon from '@mui/icons-material/FitScreenRounded'
import FolderRoundedIcon from '@mui/icons-material/FolderRounded'
import { useDropzone } from 'react-dropzone'
import {
  getDataset, getImages, getAnnotations, uploadImages, deleteImage, updateAnnotations,
  batchDeleteImages, getDatasetStats, autoSplit, batchSplit, convertImagesToJpg,
  type Dataset, type ImageItem, type DatasetStats as StatsType,
} from '../api/client'
import { useStore } from '../store/useStore'
import ClassManager from '../components/ClassManager'
import DatasetStatsPanel from '../components/DatasetStats'

const COLORS = ['#6750A4', '#0061A4', '#7D5260', '#1B8755', '#E8A317', '#B3261E', '#625B71', '#00677E', '#984061', '#006D2F']
const HANDLE_SIZE = 7
const PAGE_SIZE = 50

type ToolMode = 'view' | 'draw' | 'edit'
type DragAction = 'none' | 'draw' | 'move' | 'resize' | 'pan'
type HandlePos = 'tl' | 'tr' | 'bl' | 'br' | 'tm' | 'bm' | 'ml' | 'mr'

interface LocalAnn {
  id: number
  class_name: string
  bbox: { x: number; y: number; w: number; h: number } | null
  confidence: number | null
  source: string
  review_status: string | null
  review_comment: string | null
}

const SPLIT_CHIP: Record<string, { label: string; color: 'info' | 'warning' | 'error' | 'default' }> = {
  train: { label: 'Train', color: 'info' },
  val: { label: 'Val', color: 'warning' },
  test: { label: 'Test', color: 'error' },
}

export default function DatasetDetail() {
  const { id } = useParams<{ id: string }>()
  const datasetId = Number(id)
  const { showSnackbar } = useStore()
  const theme = useTheme()

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
  const [searchText, setSearchText] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchMenuAnchor, setBatchMenuAnchor] = useState<HTMLElement | null>(null)

  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null)
  const [selectedImageIdx, setSelectedImageIdx] = useState(-1)
  const [annotations, setAnnotations] = useState<LocalAnn[]>([])
  const [undoStack, setUndoStack] = useState<LocalAnn[][]>([])
  const [redoStack, setRedoStack] = useState<LocalAnn[][]>([])
  const [dirty, setDirty] = useState(false)
  const [toolMode, setToolMode] = useState<ToolMode>('view')
  const [selectedAnnIdx, setSelectedAnnIdx] = useState(-1)
  const [drawClassName, setDrawClassName] = useState('')
  const [clipboard, setClipboard] = useState<LocalAnn | null>(null)

  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [showAdjust, setShowAdjust] = useState(false)
  const [mouseCanvas, setMouseCanvas] = useState<{ x: number; y: number } | null>(null)

  const [splitRatios, setSplitRatios] = useState([70, 20, 10])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const baseTransformRef = useRef({ scale: 1, offsetX: 0, offsetY: 0, imgW: 0, imgH: 0 })
  const [imgLoaded, setImgLoaded] = useState(0)

  const dragRef = useRef<{
    action: DragAction; startX: number; startY: number
    origBbox: { x: number; y: number; w: number; h: number }
    handle: HandlePos | null; annIdx: number; origPan?: { x: number; y: number }
  } | null>(null)
  const [drawRect, setDrawRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

  const classColors = useMemo(() => {
    const m: Record<string, string> = {}; let ci = 0
    for (const a of annotations) { if (!m[a.class_name]) { m[a.class_name] = COLORS[ci % COLORS.length]; ci++ } }
    return m
  }, [annotations])

  const allClasses = useMemo(() => {
    const s = new Set<string>(dataset?.label_classes || [])
    annotations.forEach(a => s.add(a.class_name))
    return Array.from(s)
  }, [annotations, dataset])

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
      setImages(data.images); setTotalImages(data.total)
    } catch {}
    setLoading(false)
  }, [datasetId, page, filterLabeled, filterClass, filterSplit, searchText])

  const refreshAll = useCallback(async () => { await Promise.all([loadDataset(), loadImages(), loadStats()]) }, [loadDataset, loadImages, loadStats])
  useEffect(() => { loadDataset(); loadStats() }, [loadDataset, loadStats])
  useEffect(() => { loadImages() }, [loadImages])

  const onDrop = useCallback(async (files: File[]) => {
    if (!files.length) return
    try { await uploadImages(datasetId, files); showSnackbar(`已上傳 ${files.length} 張圖片`, 'success'); refreshAll() }
    catch { showSnackbar('上傳失敗', 'error') }
  }, [datasetId, showSnackbar, refreshAll])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'image/*': [] }, noClick: true })
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => { const files = Array.from(e.target.files || []); if (files.length) onDrop(files) }

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

  // Annotator
  const openAnnotator = async (img: ImageItem, idx: number) => {
    if (dirty) await autoSave()
    setSelectedImage(img); setSelectedImageIdx(idx); setToolMode('view'); setSelectedAnnIdx(-1); setDirty(false)
    setUndoStack([]); setRedoStack([]); setDrawRect(null); setZoom(1); setPanOffset({ x: 0, y: 0 }); setBrightness(100); setContrast(100)
    try { const { data } = await getAnnotations(img.id); setAnnotations(data as LocalAnn[]) } catch { setAnnotations([]) }
  }
  const closeAnnotator = async () => { if (dirty) await autoSave(); setSelectedImage(null); setSelectedImageIdx(-1); loadImages() }
  const navigateImage = async (dir: number) => { const newIdx = selectedImageIdx + dir; if (newIdx < 0 || newIdx >= images.length) return; await openAnnotator(images[newIdx], newIdx) }

  const autoSave = async () => {
    if (!selectedImage || !dirty) return
    try { const payload = annotations.map(a => ({ class_name: a.class_name, bbox: a.bbox, confidence: a.confidence, source: a.source })); await updateAnnotations(selectedImage.id, payload); setDirty(false) } catch {}
  }
  const handleSave = async () => {
    if (!selectedImage) return
    try {
      const payload = annotations.map(a => ({ class_name: a.class_name, bbox: a.bbox, confidence: a.confidence, source: a.source }))
      const { data } = await updateAnnotations(selectedImage.id, payload); setAnnotations(data as LocalAnn[]); setDirty(false); setUndoStack([]); setRedoStack([]); showSnackbar('標註已保存', 'success')
    } catch { showSnackbar('保存失敗', 'error') }
  }

  const pushUndo = (prev: LocalAnn[]) => { setUndoStack(s => [...s.slice(-30), prev]); setRedoStack([]); setDirty(true) }
  const handleUndo = () => { if (!undoStack.length) return; setRedoStack(r => [...r, [...annotations]]); setAnnotations(undoStack[undoStack.length - 1]); setUndoStack(s => s.slice(0, -1)); setSelectedAnnIdx(-1) }
  const handleRedo = () => { if (!redoStack.length) return; setUndoStack(s => [...s, [...annotations]]); setAnnotations(redoStack[redoStack.length - 1]); setRedoStack(r => r.slice(0, -1)); setSelectedAnnIdx(-1) }
  const handleCopy = () => { if (selectedAnnIdx >= 0 && annotations[selectedAnnIdx]) { setClipboard({ ...annotations[selectedAnnIdx] }); showSnackbar('已複製標註', 'info') } }
  const handlePaste = () => { if (!clipboard) return; pushUndo([...annotations]); const newAnn: LocalAnn = { ...clipboard, id: -Date.now(), bbox: clipboard.bbox ? { ...clipboard.bbox, x: clipboard.bbox.x + 20, y: clipboard.bbox.y + 20 } : null }; setAnnotations(anns => [...anns, newAnn]); setSelectedAnnIdx(annotations.length); setToolMode('edit') }
  const deleteAnnotation = (idx: number) => { pushUndo([...annotations]); setAnnotations(anns => anns.filter((_, i) => i !== idx)); setSelectedAnnIdx(-1) }

  const getTransform = () => { const b = baseTransformRef.current; return { scale: b.scale * zoom, offsetX: b.offsetX * zoom + panOffset.x, offsetY: b.offsetY * zoom + panOffset.y } }
  const canvasToImage = (cx: number, cy: number) => { const t = getTransform(); return { x: (cx - t.offsetX) / t.scale, y: (cy - t.offsetY) / t.scale } }
  const imageToCanvas = (ix: number, iy: number) => { const t = getTransform(); return { x: ix * t.scale + t.offsetX, y: iy * t.scale + t.offsetY } }
  const fitView = () => { setZoom(1); setPanOffset({ x: 0, y: 0 }) }

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas || !imgRef.current) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const image = imgRef.current; const t = getTransform()
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const needsFilter = brightness !== 100 || contrast !== 100
    if (needsFilter) { try { ctx.filter = `brightness(${brightness / 100}) contrast(${contrast / 100})` } catch {} }
    ctx.drawImage(image, t.offsetX, t.offsetY, image.width * t.scale, image.height * t.scale)
    if (needsFilter) { try { ctx.filter = 'none' } catch {} }

    annotations.forEach((ann, idx) => {
      if (!ann.bbox) return
      const color = classColors[ann.class_name] || '#6750A4'
      const pos = imageToCanvas(ann.bbox.x, ann.bbox.y)
      const w = ann.bbox.w * t.scale; const h = ann.bbox.h * t.scale
      const isSelected = idx === selectedAnnIdx && toolMode === 'edit'
      if (ann.review_status === 'rejected') { ctx.setLineDash([6, 4]); ctx.strokeStyle = '#B3261E' }
      else if (ann.review_status === 'needs_adjustment') { ctx.setLineDash([6, 4]); ctx.strokeStyle = '#E8A317' }
      else { ctx.setLineDash([]); ctx.strokeStyle = color }
      ctx.lineWidth = isSelected ? 3 : 2; ctx.strokeRect(pos.x, pos.y, w, h); ctx.setLineDash([])
      ctx.fillStyle = color; ctx.globalAlpha = 0.1; ctx.fillRect(pos.x, pos.y, w, h); ctx.globalAlpha = 1
      const label = `${ann.class_name}${ann.confidence ? ` ${(ann.confidence * 100).toFixed(0)}%` : ''}`
      ctx.font = '13px "Google Sans", Inter, sans-serif'; const tw = ctx.measureText(label).width
      ctx.fillStyle = ann.review_status === 'rejected' ? '#B3261E' : ann.review_status === 'needs_adjustment' ? '#E8A317' : color
      const labelH = 22; ctx.beginPath(); roundRect(ctx, pos.x, pos.y - labelH, tw + 10, labelH, 4); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.fillText(label, pos.x + 5, pos.y - 6)
      if (isSelected) {
        const handles = getHandlePositions(pos.x, pos.y, w, h)
        for (const p of handles) { ctx.fillStyle = '#fff'; ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, HANDLE_SIZE / 2 + 1, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
      }
    })

    if (drawRect) {
      ctx.strokeStyle = theme.palette.primary.main; ctx.lineWidth = 2; ctx.setLineDash([4, 4])
      const rx = Math.min(drawRect.x1, drawRect.x2), ry = Math.min(drawRect.y1, drawRect.y2)
      const rw = Math.abs(drawRect.x2 - drawRect.x1), rh = Math.abs(drawRect.y2 - drawRect.y1)
      ctx.strokeRect(rx, ry, rw, rh); ctx.fillStyle = alpha(theme.palette.primary.main, 0.12); ctx.fillRect(rx, ry, rw, rh); ctx.setLineDash([])
    }
    if (toolMode === 'draw' && mouseCanvas) {
      ctx.strokeStyle = alpha(theme.palette.primary.main, 0.4); ctx.lineWidth = 1; ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.moveTo(mouseCanvas.x, 0); ctx.lineTo(mouseCanvas.x, canvas.height); ctx.moveTo(0, mouseCanvas.y); ctx.lineTo(canvas.width, mouseCanvas.y); ctx.stroke(); ctx.setLineDash([])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, classColors, selectedAnnIdx, toolMode, drawRect, zoom, panOffset, brightness, contrast, mouseCanvas, imgLoaded])

  useEffect(() => {
    if (!selectedImage) return
    imgRef.current = null
    const image = new window.Image()
    image.onload = () => {
      imgRef.current = image
      const canvas = canvasRef.current
      if (canvas) {
        const scale = Math.min(canvas.width / image.width, canvas.height / image.height)
        baseTransformRef.current = { scale, offsetX: (canvas.width - image.width * scale) / 2, offsetY: (canvas.height - image.height * scale) / 2, imgW: image.width, imgH: image.height }
      }
      setImgLoaded(n => n + 1)
    }
    image.src = selectedImage.url
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedImage])
  useEffect(() => { drawCanvas() }, [drawCanvas])

  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>) => { const rect = canvasRef.current!.getBoundingClientRect(); const scaleX = canvasRef.current!.width / rect.width; const scaleY = canvasRef.current!.height / rect.height; return { cx: (e.clientX - rect.left) * scaleX, cy: (e.clientY - rect.top) * scaleY } }
  const findAnnotationAt = (cx: number, cy: number): number => { const t = getTransform(); for (let i = annotations.length - 1; i >= 0; i--) { const a = annotations[i]; if (!a.bbox) continue; const p = imageToCanvas(a.bbox.x, a.bbox.y); const w = a.bbox.w * t.scale; const h = a.bbox.h * t.scale; if (cx >= p.x && cx <= p.x + w && cy >= p.y && cy <= p.y + h) return i }; return -1 }
  const findHandle = (cx: number, cy: number, annIdx: number): HandlePos | null => { const a = annotations[annIdx]; if (!a?.bbox) return null; const t = getTransform(); const p = imageToCanvas(a.bbox.x, a.bbox.y); const w = a.bbox.w * t.scale; const h = a.bbox.h * t.scale; const handles = getHandlePositions(p.x, p.y, w, h); const names: HandlePos[] = ['tl', 'tr', 'bl', 'br', 'tm', 'bm', 'ml', 'mr']; for (let i = 0; i < handles.length; i++) { if (Math.abs(cx - handles[i].x) <= HANDLE_SIZE && Math.abs(cy - handles[i].y) <= HANDLE_SIZE) return names[i] }; return null }

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { cx, cy } = getCanvasPos(e)
    if (e.button === 1) { dragRef.current = { action: 'pan', startX: cx, startY: cy, origBbox: { x: 0, y: 0, w: 0, h: 0 }, handle: null, annIdx: -1, origPan: { ...panOffset } }; return }
    if (toolMode === 'draw') { dragRef.current = { action: 'draw', startX: cx, startY: cy, origBbox: { x: 0, y: 0, w: 0, h: 0 }, handle: null, annIdx: -1 }; setDrawRect({ x1: cx, y1: cy, x2: cx, y2: cy }); return }
    if (toolMode === 'edit') {
      if (selectedAnnIdx >= 0) { const handle = findHandle(cx, cy, selectedAnnIdx); if (handle) { pushUndo([...annotations]); dragRef.current = { action: 'resize', startX: cx, startY: cy, origBbox: { ...annotations[selectedAnnIdx].bbox! }, handle, annIdx: selectedAnnIdx }; return } }
      const idx = findAnnotationAt(cx, cy)
      if (idx >= 0) { setSelectedAnnIdx(idx); pushUndo([...annotations]); dragRef.current = { action: 'move', startX: cx, startY: cy, origBbox: { ...annotations[idx].bbox! }, handle: null, annIdx: idx } }
      else { setSelectedAnnIdx(-1) }
    }
  }
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { cx, cy } = getCanvasPos(e); if (toolMode === 'draw') setMouseCanvas({ x: cx, y: cy })
    if (!dragRef.current) return; const d = dragRef.current; const t = getTransform()
    if (d.action === 'pan' && d.origPan) { const rect = canvasRef.current!.getBoundingClientRect(); const scaleX = canvasRef.current!.width / rect.width; const dx = (e.clientX - rect.left) * scaleX - d.startX; const dy = (e.clientY - rect.top) * scaleX - d.startY; setPanOffset({ x: d.origPan.x + dx, y: d.origPan.y + dy }); return }
    if (d.action === 'draw') { setDrawRect({ x1: d.startX, y1: d.startY, x2: cx, y2: cy }); return }
    if (d.action === 'move') { const dx = (cx - d.startX) / t.scale; const dy = (cy - d.startY) / t.scale; const b = baseTransformRef.current; setAnnotations(anns => anns.map((a, i) => { if (i !== d.annIdx || !a.bbox) return a; return { ...a, bbox: { ...d.origBbox, x: clamp(d.origBbox.x + dx, 0, b.imgW - d.origBbox.w), y: clamp(d.origBbox.y + dy, 0, b.imgH - d.origBbox.h) } } })); return }
    if (d.action === 'resize' && d.handle) { const dx = (cx - d.startX) / t.scale; const dy = (cy - d.startY) / t.scale; const b = baseTransformRef.current; setAnnotations(anns => anns.map((a, i) => { if (i !== d.annIdx || !a.bbox) return a; return { ...a, bbox: resizeBox(d.origBbox, d.handle!, dx, dy, b.imgW, b.imgH) } })) }
  }
  const onMouseUp = () => {
    if (!dragRef.current) return; const d = dragRef.current
    if (d.action === 'draw' && drawRect) {
      const b = baseTransformRef.current; const p1 = canvasToImage(Math.min(drawRect.x1, drawRect.x2), Math.min(drawRect.y1, drawRect.y2)); const p2 = canvasToImage(Math.max(drawRect.x1, drawRect.x2), Math.max(drawRect.y1, drawRect.y2))
      const w = p2.x - p1.x; const h = p2.y - p1.y
      if (w > 3 && h > 3) { const cls = drawClassName || 'object'; pushUndo([...annotations]); const newAnn: LocalAnn = { id: -Date.now(), class_name: cls, bbox: { x: clamp(p1.x, 0, b.imgW), y: clamp(p1.y, 0, b.imgH), w: Math.min(w, b.imgW - p1.x), h: Math.min(h, b.imgH - p1.y) }, confidence: null, source: 'manual', review_status: null, review_comment: null }; setAnnotations(anns => [...anns, newAnn]); setSelectedAnnIdx(annotations.length); setToolMode('edit') }
      setDrawRect(null)
    }
    dragRef.current = null
  }
  const onMouseLeave = () => { setMouseCanvas(null); if (dragRef.current) onMouseUp() }
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => { e.preventDefault(); const factor = e.deltaY < 0 ? 1.1 : 0.9; const newZoom = clamp(zoom * factor, 0.2, 10); const { cx, cy } = getCanvasPos(e as any); const ratio = newZoom / zoom; setPanOffset({ x: cx - ratio * (cx - panOffset.x), y: cy - ratio * (cy - panOffset.y) }); setZoom(newZoom) }

  useEffect(() => {
    if (!selectedImage) return
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey; const shift = e.shiftKey; const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      switch (true) {
        case e.key === 'n' || e.key === 'N': navigateImage(1); e.preventDefault(); break
        case e.key === 'p' || e.key === 'P': navigateImage(-1); e.preventDefault(); break
        case e.key === 'd' && !ctrl: setToolMode('draw'); setSelectedAnnIdx(-1); e.preventDefault(); break
        case e.key === 'v' && !ctrl: setToolMode('view'); setSelectedAnnIdx(-1); e.preventDefault(); break
        case e.key === 'e' && !ctrl: setToolMode('edit'); e.preventDefault(); break
        case e.key === 'z' && ctrl && shift: handleRedo(); e.preventDefault(); break
        case e.key === 'z' && ctrl: handleUndo(); e.preventDefault(); break
        case e.key === 's' && ctrl: handleSave(); e.preventDefault(); break
        case e.key === 'c' && ctrl: handleCopy(); e.preventDefault(); break
        case (e.key === 'v' || e.key === 'V') && ctrl: handlePaste(); e.preventDefault(); break
        case e.key === 'Delete' || e.key === 'Backspace': if (selectedAnnIdx >= 0) { deleteAnnotation(selectedAnnIdx); e.preventDefault() }; break
        case e.key === '0' && ctrl: fitView(); e.preventDefault(); break
      }
    }
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedImage, selectedAnnIdx, annotations, undoStack, redoStack, dirty, clipboard, selectedImageIdx, images])

  const updateAnnotationClass = (idx: number, newClass: string) => { pushUndo([...annotations]); setAnnotations(anns => anns.map((a, i) => i === idx ? { ...a, class_name: newClass } : a)) }
  const cursorStyle = toolMode === 'draw' ? 'crosshair' : toolMode === 'edit' ? 'default' : 'grab'
  const pageCount = Math.ceil(totalImages / PAGE_SIZE)

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar sx={{ bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main', width: 48, height: 48 }}>
            <FolderRoundedIcon />
          </Avatar>
          <Box>
            <Typography variant="h4">{dataset?.name || '數據集'}</Typography>
            <Typography variant="body2" color="text.secondary">
              {dataset?.image_count} 張圖片 · {dataset?.annotation_count} 個標註 · {dataset?.labeled_image_count}/{dataset?.image_count} 已標註
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" component="label" startIcon={<AddPhotoAlternateRoundedIcon />} sx={{ borderRadius: 3 }}>
          上傳圖片
          <input type="file" hidden multiple accept="image/*" onChange={handleUpload} />
        </Button>
      </Box>

      <Tabs
        value={tab} onChange={(_, v) => setTab(v)}
        sx={{
          mb: 2,
          '& .MuiTab-root': { borderRadius: 3, mx: 0.5, minHeight: 40 },
          '& .Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.08) },
        }}
      >
        <Tab label="圖片" />
        <Tab label="統計" />
        <Tab label="設定" />
      </Tabs>

      {/* Tab 0: Gallery */}
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

      {/* Tab 1: Stats */}
      {tab === 1 && (stats ? <DatasetStatsPanel stats={stats} /> : <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>)}

      {/* Tab 2: Settings */}
      {tab === 2 && dataset && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card sx={{ p: 2.5 }}>
              <ClassManager dataset={dataset} stats={stats} onRefresh={refreshAll} />
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

      {/* Annotation Editor Dialog */}
      <Dialog open={!!selectedImage} onClose={closeAnnotator} maxWidth="xl" fullWidth PaperProps={{ sx: { height: '90vh', borderRadius: 4 } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, px: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton onClick={() => navigateImage(-1)} disabled={selectedImageIdx <= 0} size="small"><NavigateBeforeRoundedIcon /></IconButton>
            <Typography variant="subtitle1" noWrap sx={{ maxWidth: 300, fontWeight: 500 }}>{selectedImage?.filename} ({selectedImageIdx + 1}/{images.length})</Typography>
            <IconButton onClick={() => navigateImage(1)} disabled={selectedImageIdx >= images.length - 1} size="small"><NavigateNextRoundedIcon /></IconButton>
          </Box>
          <IconButton onClick={closeAnnotator}><CloseRoundedIcon /></IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.75, borderBottom: `1px solid ${theme.palette.divider}`, flexWrap: 'wrap', flexShrink: 0, bgcolor: alpha(theme.palette.background.paper, 0.6) }}>
            <ToggleButtonGroup size="small" exclusive value={toolMode} onChange={(_, v) => { if (v) { setToolMode(v); setSelectedAnnIdx(-1) } }}
              sx={{ '& .MuiToggleButton-root': { borderRadius: 2, px: 1.5 } }}>
              <ToggleButton value="view"><Tooltip title="查看 (V)"><VisibilityRoundedIcon fontSize="small" /></Tooltip></ToggleButton>
              <ToggleButton value="draw"><Tooltip title="繪製 (D)"><GestureRoundedIcon fontSize="small" /></Tooltip></ToggleButton>
              <ToggleButton value="edit"><Tooltip title="編輯 (E)"><EditRoundedIcon fontSize="small" /></Tooltip></ToggleButton>
            </ToggleButtonGroup>
            {toolMode === 'draw' && <Autocomplete freeSolo size="small" sx={{ width: 160 }} options={allClasses} value={drawClassName} onInputChange={(_, v) => setDrawClassName(v)} renderInput={(params) => <TextField {...params} label="類別" size="small" />} />}
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <Tooltip title="撤銷"><span><IconButton size="small" onClick={handleUndo} disabled={!undoStack.length}><UndoRoundedIcon fontSize="small" /></IconButton></span></Tooltip>
            <Tooltip title="重做"><span><IconButton size="small" onClick={handleRedo} disabled={!redoStack.length}><RedoRoundedIcon fontSize="small" /></IconButton></span></Tooltip>
            <Tooltip title="複製"><span><IconButton size="small" onClick={handleCopy} disabled={selectedAnnIdx < 0}><ContentCopyRoundedIcon fontSize="small" /></IconButton></span></Tooltip>
            <Tooltip title="貼上"><span><IconButton size="small" onClick={handlePaste} disabled={!clipboard}><ContentPasteRoundedIcon fontSize="small" /></IconButton></span></Tooltip>
            <Tooltip title="全景"><IconButton size="small" onClick={fitView}><FitScreenRoundedIcon fontSize="small" /></IconButton></Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <Tooltip title="亮度/對比度">
              <IconButton size="small" onClick={() => setShowAdjust(!showAdjust)} color={brightness !== 100 || contrast !== 100 ? 'primary' : 'default'}><BrightnessHighRoundedIcon fontSize="small" /></IconButton>
            </Tooltip>
            {showAdjust && <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <BrightnessHighRoundedIcon sx={{ fontSize: 16 }} /><Slider value={brightness} min={30} max={200} onChange={(_, v) => setBrightness(v as number)} sx={{ width: 70 }} size="small" />
              <ContrastRoundedIcon sx={{ fontSize: 16 }} /><Slider value={contrast} min={30} max={200} onChange={(_, v) => setContrast(v as number)} sx={{ width: 70 }} size="small" />
              <Button size="small" onClick={() => { setBrightness(100); setContrast(100) }}>重置</Button>
            </Box>}
            <Box sx={{ flex: 1 }} />
            <Typography variant="caption" color="text.secondary">{annotations.length} 標註 · {Math.round(zoom * 100)}%</Typography>
            <Button size="small" variant="contained" startIcon={<SaveRoundedIcon />} onClick={handleSave} disabled={!dirty} sx={{ borderRadius: 3 }}>
              保存{dirty ? ' *' : ''}
            </Button>
          </Box>

          <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <Box sx={{ flex: 1, position: 'relative', bgcolor: theme.palette.mode === 'dark' ? '#0E0D11' : '#F0EFF4', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <canvas ref={canvasRef} width={1000} height={700} style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: cursorStyle }}
                onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseLeave} onWheel={onWheel} onContextMenu={(e) => e.preventDefault()} />
            </Box>

            <Box sx={{ width: 300, borderLeft: `1px solid ${theme.palette.divider}`, overflow: 'auto', p: 1.5, flexShrink: 0 }}>
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>標註列表 ({annotations.length})</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {annotations.map((ann, i) => (
                  <Card key={ann.id} sx={{
                    p: 1, cursor: 'pointer',
                    border: selectedAnnIdx === i ? `2px solid ${theme.palette.primary.main}` : `1px solid ${theme.palette.divider}`,
                    bgcolor: selectedAnnIdx === i ? alpha(theme.palette.primary.main, 0.06) : 'background.paper',
                    transition: 'all 0.15s',
                  }} onClick={() => { setSelectedAnnIdx(i); setToolMode('edit') }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.25 }}>
                      {selectedAnnIdx === i ? (
                        <Autocomplete freeSolo size="small" sx={{ flex: 1, mr: 1 }} options={allClasses} value={ann.class_name}
                          onChange={(_, v) => { if (v) updateAnnotationClass(i, v) }}
                          onInputChange={(_, v, reason) => { if (reason === 'input') updateAnnotationClass(i, v) }}
                          renderInput={(params) => <TextField {...params} label="類別" size="small" />} />
                      ) : (
                        <Chip label={ann.class_name} size="small" sx={{ bgcolor: alpha(classColors[ann.class_name] || theme.palette.primary.main, 0.15), color: classColors[ann.class_name] || 'primary.main', maxWidth: 130, fontWeight: 500 }} />
                      )}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                        {ann.review_status === 'approved' && <Tooltip title="AI 通過"><CheckCircleRoundedIcon sx={{ fontSize: 16, color: 'success.main' }} /></Tooltip>}
                        {ann.review_status === 'rejected' && <Tooltip title={ann.review_comment || '拒絕'}><CancelRoundedIcon sx={{ fontSize: 16, color: 'error.main' }} /></Tooltip>}
                        {ann.review_status === 'needs_adjustment' && <Tooltip title={ann.review_comment || '需調整'}><WarningRoundedIcon sx={{ fontSize: 16, color: 'warning.main' }} /></Tooltip>}
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); deleteAnnotation(i) }} color="error"><DeleteRoundedIcon sx={{ fontSize: 14 }} /></IconButton>
                      </Box>
                    </Box>
                    <Typography variant="caption" color="text.secondary" fontSize={10}>
                      {ann.source}{ann.confidence ? ` · ${(ann.confidence * 100).toFixed(0)}%` : ''}
                      {ann.bbox ? ` · [${ann.bbox.x.toFixed(0)},${ann.bbox.y.toFixed(0)},${ann.bbox.w.toFixed(0)},${ann.bbox.h.toFixed(0)}]` : ''}
                    </Typography>
                  </Card>
                ))}
                {annotations.length === 0 && <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4, fontSize: 13 }}>暫無標註 — 按 D 繪製</Typography>}
              </Box>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  )
}

// Helpers
function getHandlePositions(x: number, y: number, w: number, h: number) {
  return [{ x, y }, { x: x + w, y }, { x, y: y + h }, { x: x + w, y: y + h }, { x: x + w / 2, y }, { x: x + w / 2, y: y + h }, { x, y: y + h / 2 }, { x: x + w, y: y + h / 2 }]
}
function clamp(val: number, min: number, max: number) { return Math.max(min, Math.min(max, val)) }
function resizeBox(orig: { x: number; y: number; w: number; h: number }, handle: HandlePos, dx: number, dy: number, maxW: number, maxH: number) {
  let { x, y, w, h } = orig
  switch (handle) { case 'tl': x += dx; y += dy; w -= dx; h -= dy; break; case 'tr': w += dx; y += dy; h -= dy; break; case 'bl': x += dx; w -= dx; h += dy; break; case 'br': w += dx; h += dy; break; case 'tm': y += dy; h -= dy; break; case 'bm': h += dy; break; case 'ml': x += dx; w -= dx; break; case 'mr': w += dx; break }
  if (w < 5) w = 5; if (h < 5) h = 5; x = clamp(x, 0, maxW - 5); y = clamp(y, 0, maxH - 5); w = Math.min(w, maxW - x); h = Math.min(h, maxH - y)
  return { x, y, w, h }
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath()
}
