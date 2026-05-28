import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, Divider,
  FormControlLabel, IconButton, Slider, Switch, TextField, ToggleButton, ToggleButtonGroup,
  Tooltip, Typography, alpha, useTheme,
} from '@mui/material'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import GestureRoundedIcon from '@mui/icons-material/GestureRounded'
import RectangleRoundedIcon from '@mui/icons-material/RectangleRounded'
import PolylineRoundedIcon from '@mui/icons-material/PolylineRounded'
import PushPinRoundedIcon from '@mui/icons-material/PushPinRounded'
import RotateLeftRoundedIcon from '@mui/icons-material/RotateLeftRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import UndoRoundedIcon from '@mui/icons-material/UndoRounded'
import RedoRoundedIcon from '@mui/icons-material/RedoRounded'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import ContentPasteRoundedIcon from '@mui/icons-material/ContentPasteRounded'
import FitScreenRoundedIcon from '@mui/icons-material/FitScreenRounded'
import BrightnessHighRoundedIcon from '@mui/icons-material/BrightnessHighRounded'
import ContrastRoundedIcon from '@mui/icons-material/ContrastRounded'
import NavigateBeforeRoundedIcon from '@mui/icons-material/NavigateBeforeRounded'
import NavigateNextRoundedIcon from '@mui/icons-material/NavigateNextRounded'
import GridOnRoundedIcon from '@mui/icons-material/GridOnRounded'
import MapRoundedIcon from '@mui/icons-material/MapRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded'
import CenterFocusStrongRoundedIcon from '@mui/icons-material/CenterFocusStrongRounded'
import AnnotationCanvas, { type AnnotationCanvasHandle } from './AnnotationCanvas'
import SidePanel from './SidePanel'
import ShortcutsDialog from './ShortcutsDialog'
import {
  type AnnotationItem, type Dataset, type ImageItem,
  assistAutolabelImage, assistSegment, getAnnotations, updateAnnotations, updateImageMeta,
} from '../../api/client'
import { fromApiAnnotation, toApiAnnotation, type LocalAnn, type ToolMode } from './types'
import { COLORS } from './types'
import { aabbFromPolygon } from './geometry'

interface Props {
  open: boolean
  dataset: Dataset | null
  images: ImageItem[]
  selectedImage: ImageItem | null
  selectedImageIdx: number
  onNavigate: (dir: number) => void
  onClose: () => void
  onSnackbar: (msg: string, sev?: 'success' | 'error' | 'info' | 'warning') => void
  onImagesShouldRefresh?: () => void
}

const TOOL_OPTIONS: { value: ToolMode; label: string; icon: React.ReactNode; key: string }[] = [
  { value: 'view', label: '檢視 (V)', icon: <VisibilityRoundedIcon fontSize="small" />, key: 'v' },
  { value: 'draw-bbox', label: '矩形 (B)', icon: <RectangleRoundedIcon fontSize="small" />, key: 'b' },
  { value: 'draw-polygon', label: '多邊形 (G)', icon: <PolylineRoundedIcon fontSize="small" />, key: 'g' },
  { value: 'draw-keypoint', label: '關鍵點 (K)', icon: <PushPinRoundedIcon fontSize="small" />, key: 'k' },
  { value: 'draw-obb', label: '旋轉框 (O)', icon: <RotateLeftRoundedIcon fontSize="small" />, key: 'o' },
  { value: 'smart', label: '智能分割 (M)', icon: <AutoAwesomeRoundedIcon fontSize="small" />, key: 'm' },
  { value: 'edit', label: '編輯 (E)', icon: <EditRoundedIcon fontSize="small" />, key: 'e' },
]

export default function AnnotatorDialog(p: Props) {
  const theme = useTheme()
  const canvasRef = useRef<AnnotationCanvasHandle | null>(null)

  const [annotations, _setAnnotations] = useState<LocalAnn[]>([])
  const [selectedIdxs, setSelectedIdxs] = useState<number[]>([])
  const [toolMode, setToolMode] = useState<ToolMode>('view')
  const [drawClassName, setDrawClassName] = useState('')
  const [hiddenClasses, setHiddenClasses] = useState<Set<string>>(new Set())
  const [imageMeta, setImageMeta] = useState({ verified: false, tags: [] as string[], note: '', split: null as string | null })

  const [undoStack, setUndoStack] = useState<LocalAnn[][]>([])
  const [redoStack, setRedoStack] = useState<LocalAnn[][]>([])
  const [dirty, setDirty] = useState(false)
  const [metaDirty, setMetaDirty] = useState(false)
  const [clipboard, setClipboard] = useState<LocalAnn | null>(null)

  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [showAdjust, setShowAdjust] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [showLoupe, setShowLoupe] = useState(false)
  const [showMinimap, setShowMinimap] = useState(true)
  const [snapEdges, setSnapEdges] = useState(true)

  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [autolabelLoading, setAutolabelLoading] = useState(false)
  const [smartLoading, setSmartLoading] = useState(false)

  // Load annotations and meta when image changes
  useEffect(() => {
    if (!p.selectedImage) return
    setSelectedIdxs([])
    setUndoStack([]); setRedoStack([])
    setDirty(false); setMetaDirty(false)
    setBrightness(100); setContrast(100)
    setImageMeta({
      verified: !!p.selectedImage.verified,
      tags: p.selectedImage.tags || [],
      note: p.selectedImage.note || '',
      split: p.selectedImage.split,
    })
    canvasRef.current?.fitView()
    ;(async () => {
      try {
        const { data } = await getAnnotations(p.selectedImage!.id)
        _setAnnotations(data.map(fromApiAnnotation))
      } catch {
        _setAnnotations([])
      }
    })()
  }, [p.selectedImage])

  // History wrapper around setAnnotations
  const setAnnotations = useCallback((next: LocalAnn[] | ((prev: LocalAnn[]) => LocalAnn[]), pushHistory = false) => {
    _setAnnotations(prev => {
      const updated = typeof next === 'function' ? (next as any)(prev) : next
      if (pushHistory) {
        setUndoStack(s => [...s.slice(-49), prev])
        setRedoStack([])
        setDirty(true)
      }
      return updated
    })
  }, [])

  const allClasses = useMemo(() => {
    const s = new Set<string>(p.dataset?.label_classes || [])
    annotations.forEach(a => s.add(a.class_name))
    return Array.from(s)
  }, [annotations, p.dataset])

  const classColors = useMemo(() => {
    const m: Record<string, string> = {}
    let ci = 0
    for (const c of allClasses) { m[c] = COLORS[ci % COLORS.length]; ci++ }
    return m
  }, [allClasses])

  const handleUndo = useCallback(() => {
    setUndoStack(s => {
      if (!s.length) return s
      const prev = s[s.length - 1]
      setRedoStack(r => [...r, annotations])
      _setAnnotations(prev)
      setSelectedIdxs([])
      setDirty(true)
      return s.slice(0, -1)
    })
  }, [annotations])

  const handleRedo = useCallback(() => {
    setRedoStack(r => {
      if (!r.length) return r
      const next = r[r.length - 1]
      setUndoStack(s => [...s, annotations])
      _setAnnotations(next)
      setSelectedIdxs([])
      setDirty(true)
      return r.slice(0, -1)
    })
  }, [annotations])

  const handleSave = useCallback(async () => {
    if (!p.selectedImage) return
    try {
      if (dirty) {
        const { data } = await updateAnnotations(p.selectedImage.id, annotations.map(toApiAnnotation))
        _setAnnotations((data as AnnotationItem[]).map(fromApiAnnotation))
        setDirty(false); setUndoStack([]); setRedoStack([])
      }
      if (metaDirty) {
        await updateImageMeta(p.selectedImage.id, {
          verified: imageMeta.verified, tags: imageMeta.tags, note: imageMeta.note, split: imageMeta.split,
        })
        setMetaDirty(false)
        p.onImagesShouldRefresh?.()
      }
      p.onSnackbar('已保存', 'success')
    } catch {
      p.onSnackbar('保存失敗', 'error')
    }
  }, [p, annotations, dirty, imageMeta, metaDirty])

  // Auto-save on close/navigate
  const handleClose = useCallback(async () => {
    if (dirty || metaDirty) {
      try {
        if (dirty && p.selectedImage) {
          await updateAnnotations(p.selectedImage.id, annotations.map(toApiAnnotation))
        }
        if (metaDirty && p.selectedImage) {
          await updateImageMeta(p.selectedImage.id, {
            verified: imageMeta.verified, tags: imageMeta.tags, note: imageMeta.note, split: imageMeta.split,
          })
        }
      } catch {}
    }
    p.onClose()
  }, [p, dirty, metaDirty, annotations, imageMeta])

  const handleSetMeta = useCallback((m: typeof imageMeta) => {
    setImageMeta(m)
    setMetaDirty(true)
  }, [])

  // Class changes
  const handleClassChange = useCallback((idx: number, newClass: string) => {
    if (!newClass) return
    setAnnotations(prev => prev.map((a, i) => i === idx ? { ...a, class_name: newClass } : a), true)
  }, [setAnnotations])

  // Batch
  const handleBatchChangeClass = (newClass: string) => {
    if (!newClass) return
    const set = new Set(selectedIdxs)
    setAnnotations(prev => prev.map((a, i) => set.has(i) ? { ...a, class_name: newClass } : a), true)
  }
  const handleBatchDelete = () => {
    const set = new Set(selectedIdxs)
    setAnnotations(prev => prev.filter((_, i) => !set.has(i)), true)
    setSelectedIdxs([])
  }
  const handleBatchToggleLock = () => {
    const set = new Set(selectedIdxs)
    setAnnotations(prev => prev.map((a, i) => set.has(i) ? { ...a, locked: !a.locked } : a), true)
  }

  // AI assist
  const onSmartClick = useCallback(async (point: [number, number]) => {
    if (!p.selectedImage) return
    setSmartLoading(true)
    try {
      const { data } = await assistSegment({ image_id: p.selectedImage.id, type: 'click', point })
      if (data.success && data.points && data.points.length >= 3) {
        const cls = drawClassName || (p.dataset?.label_classes?.[0]) || 'object'
        const pts = data.points as number[][]
        const bbox = aabbFromPolygon(pts) || { x: 0, y: 0, w: 0, h: 0 }
        const newAnn: LocalAnn = {
          id: -Date.now(), class_name: cls, shape_type: 'polygon',
          bbox, points: pts, confidence: null, source: 'ai-smart',
          review_status: null, review_comment: null, attributes: {}, locked: false, note: null,
        }
        setAnnotations(prev => [...prev, newAnn], true)
        setSelectedIdxs([annotations.length])
        setToolMode('edit')
        p.onSnackbar('已產生多邊形', 'success')
      } else {
        p.onSnackbar(data.error || '無法產生 polygon，試試在物件中心點擊', 'warning')
      }
    } catch (e: any) {
      p.onSnackbar(e?.response?.data?.detail || '智能分割失敗', 'error')
    } finally {
      setSmartLoading(false)
    }
  }, [p, drawClassName, annotations.length, setAnnotations])

  const handleAutolabel = useCallback(async () => {
    if (!p.selectedImage || !p.dataset) return
    setAutolabelLoading(true)
    try {
      const { data } = await assistAutolabelImage({
        image_id: p.selectedImage.id,
        classes: p.dataset.label_classes || undefined,
      })
      if (data.success && data.detections.length > 0) {
        const modelText = data.model?.model ? `（${data.model.model}）` : ''
        const newAnns: LocalAnn[] = data.detections.map(d => ({
          id: -Date.now() - Math.random(),
          class_name: d.class_name,
          shape_type: 'bbox',
          bbox: d.bbox,
          points: null,
          confidence: d.confidence,
          source: 'ai-auto',
          review_status: null,
          review_comment: null,
          attributes: {},
          locked: false,
          note: null,
        }))
        setAnnotations(prev => [...prev, ...newAnns], true)
        p.onSnackbar(`已新增 ${newAnns.length} 個標註${modelText}`, 'success')
      } else {
        const modelText = data.model?.model ? `（${data.model.model}）` : ''
        p.onSnackbar(`AI 未檢測到任何目標${modelText}`, 'info')
      }
    } catch (e: any) {
      p.onSnackbar(e?.response?.data?.detail || '自動標註失敗', 'error')
    } finally {
      setAutolabelLoading(false)
    }
  }, [p, setAnnotations])

  // Keyboard shortcuts
  useEffect(() => {
    if (!p.open) return
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const ctrl = e.ctrlKey || e.metaKey
      const shift = e.shiftKey
      const k = e.key.toLowerCase()

      // Tool switching
      if (!ctrl) {
        for (const t of TOOL_OPTIONS) {
          if (t.key === k) { setToolMode(t.value); setSelectedIdxs([]); e.preventDefault(); return }
        }
      }

      if (ctrl && k === 'z' && !shift) { handleUndo(); e.preventDefault(); return }
      if (ctrl && k === 'z' && shift) { handleRedo(); e.preventDefault(); return }
      if (ctrl && k === 's') { handleSave(); e.preventDefault(); return }
      if (ctrl && k === '0') { canvasRef.current?.fitView(); e.preventDefault(); return }
      if (ctrl && k === 'c') {
        if (selectedIdxs.length === 1) { setClipboard({ ...annotations[selectedIdxs[0]] }); p.onSnackbar('已複製', 'info') }
        e.preventDefault(); return
      }
      if (ctrl && k === 'v') {
        if (clipboard) {
          const offsetCopy: LocalAnn = JSON.parse(JSON.stringify(clipboard))
          offsetCopy.id = -Date.now()
          if (offsetCopy.bbox) { offsetCopy.bbox = { ...offsetCopy.bbox, x: offsetCopy.bbox.x + 20, y: offsetCopy.bbox.y + 20 } }
          if (Array.isArray(offsetCopy.points) && offsetCopy.shape_type === 'polygon') {
            offsetCopy.points = (offsetCopy.points as number[][]).map(([x, y]) => [x + 20, y + 20])
          }
          setAnnotations(prev => [...prev, offsetCopy], true)
        }
        e.preventDefault(); return
      }
      if (k === 'delete' || k === 'backspace') {
        if (selectedIdxs.length) {
          setAnnotations(prev => prev.filter((_, i) => !selectedIdxs.includes(i)), true)
          setSelectedIdxs([])
          e.preventDefault()
        }
        return
      }
      if (k === 'enter' && toolMode === 'draw-polygon') { canvasRef.current?.finishPolygon(); e.preventDefault(); return }
      if (k === 'escape') { canvasRef.current?.cancelDraft(); e.preventDefault(); return }
      if (k === 'n' || e.key === 'ArrowRight') { p.onNavigate(1); e.preventDefault(); return }
      if (k === 'p' || e.key === 'ArrowLeft') { p.onNavigate(-1); e.preventDefault(); return }
      if (k === 'l') {
        if (selectedIdxs.length) handleBatchToggleLock()
        e.preventDefault(); return
      }
      if (k === '?') { setShortcutsOpen(true); e.preventDefault(); return }
      if (k === 't') { handleSetMeta({ ...imageMeta, split: 'train' }); e.preventDefault(); return }
      if (k === 'y') { handleSetMeta({ ...imageMeta, split: 'val' }); e.preventDefault(); return }
      if (k === 'u') { handleSetMeta({ ...imageMeta, split: 'test' }); e.preventDefault(); return }

      // Number hotkeys 1-9 → set draw class
      if (/^[1-9]$/.test(k)) {
        const idx = parseInt(k) - 1
        const cls = (p.dataset?.label_classes || [])[idx]
        if (cls) { setDrawClassName(cls); p.onSnackbar(`類別: ${cls}`, 'info') }
        e.preventDefault(); return
      }

      // Arrow nudge for selected bbox
      if (selectedIdxs.length && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const step = shift ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        const set = new Set(selectedIdxs)
        setAnnotations(prev => prev.map((a, i) => {
          if (!set.has(i) || a.locked) return a
          if (a.shape_type === 'bbox' && a.bbox) {
            return { ...a, bbox: { ...a.bbox, x: a.bbox.x + dx, y: a.bbox.y + dy } }
          }
          if (a.shape_type === 'polygon' && Array.isArray(a.points)) {
            const newPts = (a.points as number[][]).map(([x, y]) => [x + dx, y + dy])
            return { ...a, points: newPts, bbox: aabbFromPolygon(newPts) || a.bbox }
          }
          return a
        }), true)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [p, selectedIdxs, annotations, clipboard, toolMode, imageMeta, handleUndo, handleRedo, handleSave, handleBatchToggleLock, handleSetMeta, setAnnotations])

  return (
    <Dialog open={p.open} onClose={handleClose} maxWidth="xl" fullWidth PaperProps={{ sx: { height: '92vh', borderRadius: 4 } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, px: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={() => p.onNavigate(-1)} disabled={p.selectedImageIdx <= 0} size="small"><NavigateBeforeRoundedIcon /></IconButton>
          <Typography variant="subtitle1" noWrap sx={{ maxWidth: 320, fontWeight: 500 }}>
            {p.selectedImage?.filename} ({p.selectedImageIdx + 1}/{p.images.length})
          </Typography>
          <IconButton onClick={() => p.onNavigate(1)} disabled={p.selectedImageIdx >= p.images.length - 1} size="small"><NavigateNextRoundedIcon /></IconButton>
          {imageMeta.verified && <Chip label="已驗證" size="small" color="success" />}
          {imageMeta.split && <Chip label={imageMeta.split} size="small" color={imageMeta.split === 'train' ? 'info' : imageMeta.split === 'val' ? 'warning' : 'error'} />}
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <Tooltip title="鍵盤快捷鍵 (?)"><IconButton size="small" onClick={() => setShortcutsOpen(true)}><HelpOutlineRoundedIcon fontSize="small" /></IconButton></Tooltip>
          <IconButton onClick={handleClose}><CloseRoundedIcon /></IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Toolbar */}
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.75,
          borderBottom: `1px solid ${theme.palette.divider}`,
          flexWrap: 'wrap', flexShrink: 0, bgcolor: alpha(theme.palette.background.paper, 0.6),
        }}>
          <ToggleButtonGroup size="small" exclusive value={toolMode} onChange={(_, v) => v && setToolMode(v)}>
            {TOOL_OPTIONS.map(t => (
              <ToggleButton key={t.value} value={t.value}>
                <Tooltip title={t.label}>{t.icon as any}</Tooltip>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {(toolMode.startsWith('draw') || toolMode === 'smart') && (
            <Autocomplete
              freeSolo size="small" sx={{ width: 180 }} options={allClasses}
              value={drawClassName}
              onInputChange={(_, v) => setDrawClassName(v)}
              renderInput={(params) => <TextField {...params} label="類別" size="small" />}
            />
          )}

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Tooltip title="撤銷"><span><IconButton size="small" onClick={handleUndo} disabled={!undoStack.length}><UndoRoundedIcon fontSize="small" /></IconButton></span></Tooltip>
          <Tooltip title="重做"><span><IconButton size="small" onClick={handleRedo} disabled={!redoStack.length}><RedoRoundedIcon fontSize="small" /></IconButton></span></Tooltip>
          <Tooltip title="複製"><span><IconButton size="small" onClick={() => { if (selectedIdxs.length === 1) { setClipboard({ ...annotations[selectedIdxs[0]] }); p.onSnackbar('已複製', 'info') } }} disabled={selectedIdxs.length !== 1}><ContentCopyRoundedIcon fontSize="small" /></IconButton></span></Tooltip>
          <Tooltip title="貼上"><span><IconButton size="small" disabled={!clipboard} onClick={() => {
            if (!clipboard) return
            const cp: LocalAnn = JSON.parse(JSON.stringify(clipboard))
            cp.id = -Date.now()
            if (cp.bbox) cp.bbox = { ...cp.bbox, x: cp.bbox.x + 20, y: cp.bbox.y + 20 }
            if (Array.isArray(cp.points) && cp.shape_type === 'polygon') {
              cp.points = (cp.points as number[][]).map(([x, y]) => [x + 20, y + 20])
            }
            setAnnotations(prev => [...prev, cp], true)
          }}><ContentPasteRoundedIcon fontSize="small" /></IconButton></span></Tooltip>
          <Tooltip title="全景 (Ctrl+0)"><IconButton size="small" onClick={() => canvasRef.current?.fitView()}><FitScreenRoundedIcon fontSize="small" /></IconButton></Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Tooltip title={showGrid ? '隱藏像素網格' : '顯示像素網格'}>
            <IconButton size="small" color={showGrid ? 'primary' : 'default'} onClick={() => setShowGrid(g => !g)}><GridOnRoundedIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title={showLoupe ? '隱藏放大鏡' : '顯示放大鏡'}>
            <IconButton size="small" color={showLoupe ? 'primary' : 'default'} onClick={() => setShowLoupe(g => !g)}><SearchRoundedIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title={showMinimap ? '隱藏小地圖' : '顯示小地圖'}>
            <IconButton size="small" color={showMinimap ? 'primary' : 'default'} onClick={() => setShowMinimap(g => !g)}><MapRoundedIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="邊緣磁吸">
            <IconButton size="small" color={snapEdges ? 'primary' : 'default'} onClick={() => setSnapEdges(g => !g)}><CenterFocusStrongRoundedIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="亮度/對比度">
            <IconButton size="small" onClick={() => setShowAdjust(s => !s)} color={brightness !== 100 || contrast !== 100 ? 'primary' : 'default'}><BrightnessHighRoundedIcon fontSize="small" /></IconButton>
          </Tooltip>
          {showAdjust && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <BrightnessHighRoundedIcon sx={{ fontSize: 16 }} />
              <Slider value={brightness} min={30} max={200} onChange={(_, v) => setBrightness(v as number)} sx={{ width: 70 }} size="small" />
              <ContrastRoundedIcon sx={{ fontSize: 16 }} />
              <Slider value={contrast} min={30} max={200} onChange={(_, v) => setContrast(v as number)} sx={{ width: 70 }} size="small" />
              <Button size="small" onClick={() => { setBrightness(100); setContrast(100) }}>重置</Button>
            </Box>
          )}

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Tooltip title="一鍵自動標註本圖">
            <span>
              <Button
                size="small"
                variant="tonal"
                startIcon={autolabelLoading ? <CircularProgress size={14} /> : <AutoAwesomeRoundedIcon />}
                disabled={autolabelLoading || !p.dataset?.label_classes?.length}
                onClick={handleAutolabel}
              >
                AI 標註
              </Button>
            </span>
          </Tooltip>

          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {annotations.length} 標註 {smartLoading && '· 智能分割中...'}
          </Typography>
          <Button size="small" variant="contained" startIcon={<SaveRoundedIcon />} onClick={handleSave} disabled={!dirty && !metaDirty}>
            保存{(dirty || metaDirty) ? ' *' : ''}
          </Button>
        </Box>

        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Box sx={{
            flex: 1, position: 'relative',
            bgcolor: theme.palette.mode === 'dark' ? '#0E0D11' : '#F0EFF4',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            {p.selectedImage && (
              <AnnotationCanvas
                ref={canvasRef}
                imageUrl={p.selectedImage.url}
                imageWidth={p.selectedImage.width}
                imageHeight={p.selectedImage.height}
                annotations={annotations}
                setAnnotations={setAnnotations}
                selectedIdxs={selectedIdxs}
                setSelectedIdxs={setSelectedIdxs}
                toolMode={toolMode}
                setToolMode={setToolMode}
                drawClassName={drawClassName}
                hiddenClasses={hiddenClasses}
                brightness={brightness}
                contrast={contrast}
                showGrid={showGrid}
                showLoupe={showLoupe}
                showMinimap={showMinimap}
                snapToImageEdges={snapEdges}
                keypointSchema={p.dataset?.keypoint_schema || null}
                onSmartClick={onSmartClick}
                classColors={classColors}
              />
            )}
          </Box>

          <SidePanel
            annotations={annotations}
            setAnnotations={setAnnotations}
            selectedIdxs={selectedIdxs}
            setSelectedIdxs={setSelectedIdxs}
            classColors={classColors}
            allClasses={allClasses}
            hiddenClasses={hiddenClasses}
            setHiddenClasses={setHiddenClasses}
            imageMeta={imageMeta}
            setImageMeta={handleSetMeta}
            imageItem={p.selectedImage}
            imageWidth={p.selectedImage?.width || 0}
            imageHeight={p.selectedImage?.height || 0}
            onClassChange={handleClassChange}
            onBatchChangeClass={handleBatchChangeClass}
            onBatchDelete={handleBatchDelete}
            onBatchToggleLock={handleBatchToggleLock}
          />
        </Box>
      </DialogContent>

      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </Dialog>
  )
}
