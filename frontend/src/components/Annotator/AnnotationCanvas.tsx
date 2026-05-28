import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { alpha, useTheme } from '@mui/material'
import {
  aabbFromKeypoints,
  aabbFromPolygon,
  aabbFromObb,
  canvasToImage,
  clamp,
  distanceToSegment,
  findAnnotationAt,
  findBboxHandle,
  getBboxHandlePositions,
  imageToCanvas,
  obbToCorners,
  pointInPolygon,
  resizeBbox,
  snapToEdges,
} from './geometry'
import type {
  BBox,
  CanvasTransform,
  DragState,
  KeypointPoint,
  KeypointSchema,
  LocalAnn,
  OBBPoints,
  ShapeType,
  ToolMode,
} from './types'
import { COLORS, HANDLE_SIZE } from './types'

export interface AnnotationCanvasHandle {
  fitView: () => void
  zoomTo: (factor: number) => void
  setView: (zoom: number, pan: { x: number; y: number }) => void
  finishPolygon: () => void
  cancelDraft: () => void
  deleteSelectedVertex: () => void
}

export interface AnnotationCanvasProps {
  imageUrl: string
  imageWidth: number
  imageHeight: number
  annotations: LocalAnn[]
  setAnnotations: (next: LocalAnn[] | ((prev: LocalAnn[]) => LocalAnn[]), pushHistory?: boolean) => void
  selectedIdxs: number[]
  setSelectedIdxs: (idx: number[]) => void
  toolMode: ToolMode
  setToolMode: (m: ToolMode) => void
  drawClassName: string
  hiddenClasses: Set<string>
  brightness: number
  contrast: number
  showGrid: boolean
  showLoupe: boolean
  showMinimap: boolean
  snapToImageEdges: boolean
  keypointSchema: KeypointSchema | null
  onSmartClick?: (point: [number, number]) => void
  onContextMenuAnnotation?: (idx: number, x: number, y: number) => void
  classColors: Record<string, string>
}

const DEFAULT_CANVAS_W = 1000
const DEFAULT_CANVAS_H = 700
const VERTEX_HANDLE_SIZE = 7
const EDGE_INSERT_RADIUS = 6

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

const AnnotationCanvas = forwardRef<AnnotationCanvasHandle, AnnotationCanvasProps>(function AnnotationCanvas(props, ref) {
  const {
    imageUrl, imageWidth, imageHeight, annotations, setAnnotations,
    selectedIdxs, setSelectedIdxs, toolMode, setToolMode,
    drawClassName, hiddenClasses, brightness, contrast, showGrid, showLoupe, showMinimap, snapToImageEdges,
    keypointSchema, onSmartClick, onContextMenuAnnotation, classColors,
  } = props

  const theme = useTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [imgLoaded, setImgLoaded] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const baseTransformRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 })

  const dragRef = useRef<DragState | null>(null)
  const [drawDraft, setDrawDraft] = useState<{ kind: ShapeType; data: any } | null>(null)
  const [hoverCanvas, setHoverCanvas] = useState<{ x: number; y: number } | null>(null)
  const [hoverEdge, setHoverEdge] = useState<{ annIdx: number; segIdx: number; ix: number; iy: number } | null>(null)
  const [shiftHeld, setShiftHeld] = useState(false)

  // ── Imperative API ─────────────────────────────────────────────────
  const fitView = useCallback(() => { setZoom(1); setPanOffset({ x: 0, y: 0 }) }, [])
  useImperativeHandle(ref, () => ({
    fitView,
    zoomTo: (factor: number) => setZoom(z => clamp(z * factor, 0.2, 16)),
    setView: (z, p) => { setZoom(z); setPanOffset(p) },
    finishPolygon: () => {
      if (drawDraft?.kind === 'polygon' && Array.isArray(drawDraft.data) && drawDraft.data.length >= 3) {
        const cls = drawClassName || 'object'
        const pts = drawDraft.data as number[][]
        const bbox = aabbFromPolygon(pts) || { x: 0, y: 0, w: 0, h: 0 }
        const newAnn: LocalAnn = {
          id: -Date.now(), class_name: cls, shape_type: 'polygon',
          bbox, points: pts, confidence: null, source: 'manual',
          review_status: null, review_comment: null, attributes: {}, locked: false, note: null,
        }
        setAnnotations(prev => [...prev, newAnn], true)
        setDrawDraft(null)
        setSelectedIdxs([annotations.length])
        setToolMode('edit')
      }
    },
    cancelDraft: () => setDrawDraft(null),
    deleteSelectedVertex: () => {
      if (selectedIdxs.length !== 1) return
      const idx = selectedIdxs[0]
      const a = annotations[idx]
      if (!a || a.shape_type !== 'polygon' || !Array.isArray(a.points) || a.points.length <= 3) return
    },
  }))

  // ── Image load ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!imageUrl) return
    imgRef.current = null
    const image = new window.Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      imgRef.current = image
      const canvas = canvasRef.current
      if (canvas) {
        const scale = Math.min(canvas.width / image.width, canvas.height / image.height)
        baseTransformRef.current = {
          scale,
          offsetX: (canvas.width - image.width * scale) / 2,
          offsetY: (canvas.height - image.height * scale) / 2,
        }
      }
      setImgLoaded(n => n + 1)
    }
    image.src = imageUrl
  }, [imageUrl])

  // ── Transform helpers ──────────────────────────────────────────────
  const getTransform = useCallback((): CanvasTransform => {
    const b = baseTransformRef.current
    return { scale: b.scale * zoom, offsetX: b.offsetX * zoom + panOffset.x, offsetY: b.offsetY * zoom + panOffset.y }
  }, [zoom, panOffset])

  // Re-fit on imgLoaded change
  useEffect(() => { /* trigger redraw */ }, [imgLoaded])

  // ── Keyboard state (Shift) ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => setShiftHeld(e.shiftKey)
    window.addEventListener('keydown', handler)
    window.addEventListener('keyup', handler)
    return () => { window.removeEventListener('keydown', handler); window.removeEventListener('keyup', handler) }
  }, [])

  // ── Drawing ────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !imgRef.current) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const t = getTransform()
    const image = imgRef.current

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const needsFilter = brightness !== 100 || contrast !== 100
    if (needsFilter) try { ctx.filter = `brightness(${brightness / 100}) contrast(${contrast / 100})` } catch {}
    ctx.drawImage(image, t.offsetX, t.offsetY, image.width * t.scale, image.height * t.scale)
    if (needsFilter) try { ctx.filter = 'none' } catch {}

    // Pixel grid when zoom is high enough
    if (showGrid && t.scale > 6) {
      ctx.save()
      ctx.strokeStyle = alpha('#888', 0.18)
      ctx.lineWidth = 1
      const startX = Math.max(0, Math.floor(-t.offsetX / t.scale))
      const startY = Math.max(0, Math.floor(-t.offsetY / t.scale))
      const endX = Math.min(image.width, Math.ceil((canvas.width - t.offsetX) / t.scale))
      const endY = Math.min(image.height, Math.ceil((canvas.height - t.offsetY) / t.scale))
      ctx.beginPath()
      for (let x = startX; x <= endX; x++) {
        const cx = x * t.scale + t.offsetX
        ctx.moveTo(cx, t.offsetY)
        ctx.lineTo(cx, t.offsetY + image.height * t.scale)
      }
      for (let y = startY; y <= endY; y++) {
        const cy = y * t.scale + t.offsetY
        ctx.moveTo(t.offsetX, cy)
        ctx.lineTo(t.offsetX + image.width * t.scale, cy)
      }
      ctx.stroke()
      ctx.restore()
    }

    annotations.forEach((a, idx) => {
      if (hiddenClasses.has(a.class_name)) return
      const color = classColors[a.class_name] || COLORS[idx % COLORS.length]
      const isSelected = selectedIdxs.includes(idx) && (toolMode === 'edit' || toolMode === 'view')
      drawShape(ctx, t, a, color, isSelected, keypointSchema)
    })

    // Edge-insert ghost vertex on polygon edge
    if (hoverEdge && toolMode === 'edit') {
      const a = annotations[hoverEdge.annIdx]
      if (a && a.shape_type === 'polygon') {
        const p = imageToCanvas(t, hoverEdge.ix, hoverEdge.iy)
        ctx.fillStyle = '#fff'
        ctx.strokeStyle = theme.palette.primary.main
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(p.x, p.y, VERTEX_HANDLE_SIZE / 2 + 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      }
    }

    // Draft draw
    if (drawDraft) {
      ctx.save()
      ctx.strokeStyle = theme.palette.primary.main
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      if (drawDraft.kind === 'bbox' || drawDraft.kind === 'obb') {
        const d = drawDraft.data as { x1: number; y1: number; x2: number; y2: number }
        const rx = Math.min(d.x1, d.x2), ry = Math.min(d.y1, d.y2)
        const rw = Math.abs(d.x2 - d.x1), rh = Math.abs(d.y2 - d.y1)
        ctx.strokeRect(rx, ry, rw, rh)
        ctx.fillStyle = alpha(theme.palette.primary.main, 0.12)
        ctx.fillRect(rx, ry, rw, rh)
      } else if (drawDraft.kind === 'polygon') {
        const pts = drawDraft.data as number[][]
        ctx.beginPath()
        pts.forEach((p, i) => {
          const c = imageToCanvas(t, p[0], p[1])
          if (i === 0) ctx.moveTo(c.x, c.y)
          else ctx.lineTo(c.x, c.y)
        })
        if (hoverCanvas && pts.length) {
          ctx.lineTo(hoverCanvas.x, hoverCanvas.y)
        }
        ctx.stroke()
        ctx.setLineDash([])
        pts.forEach((p, i) => {
          const c = imageToCanvas(t, p[0], p[1])
          ctx.fillStyle = i === 0 ? '#22c55e' : theme.palette.primary.main
          ctx.beginPath(); ctx.arc(c.x, c.y, VERTEX_HANDLE_SIZE / 2 + 1, 0, Math.PI * 2); ctx.fill()
        })
      } else if (drawDraft.kind === 'keypoint') {
        const pts = drawDraft.data as KeypointPoint[]
        const names = keypointSchema?.names || []
        pts.forEach((p, i) => {
          const c = imageToCanvas(t, p.x, p.y)
          ctx.fillStyle = '#22c55e'
          ctx.beginPath(); ctx.arc(c.x, c.y, VERTEX_HANDLE_SIZE / 2 + 1, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = '#fff'
          ctx.font = '11px sans-serif'
          ctx.fillText(p.name || names[i] || `kp${i + 1}`, c.x + 8, c.y - 6)
        })
        if (names.length && pts.length < names.length && hoverCanvas) {
          ctx.fillStyle = alpha(theme.palette.primary.main, 0.7)
          ctx.beginPath(); ctx.arc(hoverCanvas.x, hoverCanvas.y, VERTEX_HANDLE_SIZE / 2, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = '#fff'
          ctx.font = '11px sans-serif'
          ctx.fillText(names[pts.length] || '', hoverCanvas.x + 8, hoverCanvas.y - 6)
        }
      }
      ctx.restore()
    }

    // Crosshair cursor
    if ((toolMode.startsWith('draw') || toolMode === 'smart') && hoverCanvas) {
      ctx.save()
      ctx.strokeStyle = alpha(theme.palette.primary.main, 0.4)
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(hoverCanvas.x, 0); ctx.lineTo(hoverCanvas.x, canvas.height)
      ctx.moveTo(0, hoverCanvas.y); ctx.lineTo(canvas.width, hoverCanvas.y)
      ctx.stroke()
      ctx.restore()
    }

    // Loupe
    if (showLoupe && hoverCanvas && imgRef.current) {
      drawLoupe(ctx, canvas, imgRef.current, t, hoverCanvas, brightness, contrast)
    }

    // Mini-map
    if (showMinimap && imgRef.current) {
      drawMinimap(ctx, canvas, imgRef.current, t, theme.palette.primary.main, theme.palette.divider)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, selectedIdxs, toolMode, drawDraft, zoom, panOffset, brightness, contrast, hoverCanvas, hoverEdge, hiddenClasses, classColors, showGrid, showLoupe, showMinimap, imgLoaded, keypointSchema])

  useEffect(() => { draw() }, [draw])

  // ── Mouse helpers ──────────────────────────────────────────────────
  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = canvasRef.current!.width / rect.width
    const sy = canvasRef.current!.height / rect.height
    return { cx: (e.clientX - rect.left) * sx, cy: (e.clientY - rect.top) * sy }
  }

  const getImagePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { cx, cy } = getCanvasPos(e)
    return canvasToImage(getTransform(), cx, cy)
  }

  // Find handle on selected annotation (for resize)
  const findHandleAt = (canvasX: number, canvasY: number, annIdx: number) => {
    const a = annotations[annIdx]
    if (!a) return null
    const t = getTransform()
    if (a.shape_type === 'bbox' && a.bbox) {
      const p = imageToCanvas(t, a.bbox.x, a.bbox.y)
      const w = a.bbox.w * t.scale, h = a.bbox.h * t.scale
      return findBboxHandle(canvasX, canvasY, p.x, p.y, w, h)
    }
    if (a.shape_type === 'obb' && a.points && !Array.isArray(a.points)) {
      // OBB: 4 corners + rotation handle (above top-mid)
      const obb = a.points as OBBPoints
      const corners = obbToCorners(obb)
      for (let i = 0; i < 4; i++) {
        const c = imageToCanvas(t, corners[i][0], corners[i][1])
        if (Math.abs(canvasX - c.x) <= HANDLE_SIZE && Math.abs(canvasY - c.y) <= HANDLE_SIZE) {
          return ['c0', 'c1', 'c2', 'c3'][i] as any
        }
      }
      // rotation handle above top-mid
      const topMid = [(corners[0][0] + corners[1][0]) / 2, (corners[0][1] + corners[1][1]) / 2]
      const dx = Math.cos(obb.theta - Math.PI / 2) * 30 / t.scale
      const dy = Math.sin(obb.theta - Math.PI / 2) * 30 / t.scale
      const rh = imageToCanvas(t, topMid[0] + dx, topMid[1] + dy)
      if (Math.abs(canvasX - rh.x) <= HANDLE_SIZE && Math.abs(canvasY - rh.y) <= HANDLE_SIZE) return 'rotate' as any
    }
    return null
  }

  const findVertexAt = (canvasX: number, canvasY: number, annIdx: number) => {
    const a = annotations[annIdx]
    if (!a) return -1
    const t = getTransform()
    if (a.shape_type === 'polygon' && Array.isArray(a.points)) {
      for (let i = 0; i < (a.points as number[][]).length; i++) {
        const p = (a.points as number[][])[i]
        const c = imageToCanvas(t, p[0], p[1])
        if (Math.abs(canvasX - c.x) <= VERTEX_HANDLE_SIZE && Math.abs(canvasY - c.y) <= VERTEX_HANDLE_SIZE) return i
      }
    } else if (a.shape_type === 'keypoint' && Array.isArray(a.points)) {
      for (let i = 0; i < (a.points as KeypointPoint[]).length; i++) {
        const p = (a.points as KeypointPoint[])[i]
        const c = imageToCanvas(t, p.x, p.y)
        if (Math.abs(canvasX - c.x) <= VERTEX_HANDLE_SIZE && Math.abs(canvasY - c.y) <= VERTEX_HANDLE_SIZE) return i
      }
    }
    return -1
  }

  const findEdgeInsertion = (canvasX: number, canvasY: number, annIdx: number): { segIdx: number; ix: number; iy: number } | null => {
    const a = annotations[annIdx]
    if (!a || a.shape_type !== 'polygon' || !Array.isArray(a.points)) return null
    const pts = a.points as number[][]
    const t = getTransform()
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length
      const c1 = imageToCanvas(t, pts[i][0], pts[i][1])
      const c2 = imageToCanvas(t, pts[j][0], pts[j][1])
      const d = distanceToSegment(canvasX, canvasY, c1.x, c1.y, c2.x, c2.y)
      if (d <= EDGE_INSERT_RADIUS) {
        const { x: ix, y: iy } = canvasToImage(t, canvasX, canvasY)
        return { segIdx: i, ix, iy }
      }
    }
    return null
  }

  // ── Mouse events ───────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { cx, cy } = getCanvasPos(e)
    const { x: ix, y: iy } = canvasToImage(getTransform(), cx, cy)

    // Middle button or space-held = pan
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      dragRef.current = {
        action: 'pan', startX: cx, startY: cy, annIdx: -1,
        origPan: { ...panOffset },
      }
      return
    }

    // Right click handling
    if (e.button === 2) {
      const idx = findAnnotationAt(annotations, hiddenClasses.size ? new Set(Array.from(annotations.map(a => a.class_name)).filter(c => !hiddenClasses.has(c))) : null, ix, iy)
      if (idx >= 0 && onContextMenuAnnotation) {
        onContextMenuAnnotation(idx, e.clientX, e.clientY)
      } else if (selectedIdxs.length === 1) {
        // Try delete vertex
        const annIdx = selectedIdxs[0]
        const v = findVertexAt(cx, cy, annIdx)
        const a = annotations[annIdx]
        if (v >= 0 && a && a.shape_type === 'polygon' && Array.isArray(a.points) && (a.points as number[][]).length > 3) {
          setAnnotations(prev => prev.map((p, i) => {
            if (i !== annIdx) return p
            const newPts = (p.points as number[][]).filter((_, k) => k !== v)
            return { ...p, points: newPts, bbox: aabbFromPolygon(newPts) || p.bbox }
          }), true)
        }
      }
      return
    }

    // Smart tool: just emit click and let parent handle
    if (toolMode === 'smart') {
      onSmartClick?.([ix, iy])
      return
    }

    // Draw modes
    if (toolMode === 'draw-bbox') {
      dragRef.current = { action: 'draw', startX: cx, startY: cy, annIdx: -1 }
      setDrawDraft({ kind: 'bbox', data: { x1: cx, y1: cy, x2: cx, y2: cy } })
      return
    }
    if (toolMode === 'draw-obb') {
      dragRef.current = { action: 'draw', startX: cx, startY: cy, annIdx: -1 }
      setDrawDraft({ kind: 'obb', data: { x1: cx, y1: cy, x2: cx, y2: cy } })
      return
    }
    if (toolMode === 'draw-polygon') {
      const existing = drawDraft && drawDraft.kind === 'polygon' ? (drawDraft.data as number[][]) : []
      // Click first vertex to close
      if (existing.length >= 3) {
        const t = getTransform()
        const first = imageToCanvas(t, existing[0][0], existing[0][1])
        if (Math.abs(first.x - cx) <= VERTEX_HANDLE_SIZE + 2 && Math.abs(first.y - cy) <= VERTEX_HANDLE_SIZE + 2) {
          finalizePolygon(existing)
          return
        }
      }
      let [sx, sy] = [ix, iy]
      if (snapToImageEdges) [sx, sy] = snapToEdges(sx, sy, imageWidth, imageHeight)
      setDrawDraft({ kind: 'polygon', data: [...existing, [sx, sy]] })
      return
    }
    if (toolMode === 'draw-keypoint') {
      const names = keypointSchema?.names || []
      if (!names.length) return
      const existing = drawDraft && drawDraft.kind === 'keypoint' ? (drawDraft.data as KeypointPoint[]) : []
      if (existing.length >= names.length) return
      const next = [...existing, { x: ix, y: iy, v: 2, name: names[existing.length] }]
      if (next.length === names.length) {
        finalizeKeypoints(next)
      } else {
        setDrawDraft({ kind: 'keypoint', data: next })
      }
      return
    }

    // Edit mode
    if (toolMode === 'edit') {
      // Try to find handle on currently-selected annotation
      if (selectedIdxs.length === 1) {
        const annIdx = selectedIdxs[0]
        const a = annotations[annIdx]
        if (a && !a.locked) {
          const handle = findHandleAt(cx, cy, annIdx)
          if (handle === 'rotate') {
            dragRef.current = {
              action: 'rotate', startX: cx, startY: cy, annIdx,
              origPoints: a.points,
            }
            return
          }
          if (handle && handle.startsWith('c')) {
            dragRef.current = { action: 'resize', startX: cx, startY: cy, annIdx, handle: null, origPoints: a.points, vertexIdx: parseInt(handle.slice(1)) }
            return
          }
          if (handle) {
            dragRef.current = {
              action: 'resize', startX: cx, startY: cy, annIdx, handle,
              origBbox: a.bbox ? { ...a.bbox } : undefined,
            }
            return
          }
          // Polygon vertex
          const v = findVertexAt(cx, cy, annIdx)
          if (v >= 0) {
            dragRef.current = {
              action: 'vertex', startX: cx, startY: cy, annIdx, vertexIdx: v,
              origPoints: Array.isArray(a.points) ? JSON.parse(JSON.stringify(a.points)) : a.points,
            }
            return
          }
          // Polygon edge insert
          const edge = findEdgeInsertion(cx, cy, annIdx)
          if (edge) {
            const newPts = [...(a.points as number[][])]
            newPts.splice(edge.segIdx + 1, 0, [edge.ix, edge.iy])
            setAnnotations(prev => prev.map((p, i) => i === annIdx ? { ...p, points: newPts, bbox: aabbFromPolygon(newPts) || p.bbox } : p), true)
            dragRef.current = {
              action: 'vertex', startX: cx, startY: cy, annIdx, vertexIdx: edge.segIdx + 1,
              origPoints: JSON.parse(JSON.stringify(newPts)),
            }
            return
          }
        }
      }

      // Click to select an annotation (or start moving)
      const visibleSet = hiddenClasses.size ? new Set(annotations.filter(a => !hiddenClasses.has(a.class_name)).map(a => a.class_name)) : null
      const idx = findAnnotationAt(annotations, visibleSet, ix, iy)
      if (idx >= 0) {
        const additive = e.shiftKey || e.metaKey || e.ctrlKey
        if (additive) {
          if (selectedIdxs.includes(idx)) setSelectedIdxs(selectedIdxs.filter(i => i !== idx))
          else setSelectedIdxs([...selectedIdxs, idx])
        } else if (!selectedIdxs.includes(idx)) {
          setSelectedIdxs([idx])
        }
        const a = annotations[idx]
        if (a && !a.locked) {
          dragRef.current = {
            action: 'move', startX: cx, startY: cy, annIdx: idx,
            origBbox: a.bbox ? { ...a.bbox } : undefined,
            origPoints: Array.isArray(a.points) ? JSON.parse(JSON.stringify(a.points)) : a.points ? { ...(a.points as any) } : null,
          }
        }
        return
      }
      setSelectedIdxs([])
    }

    // View mode click selects without drag
    if (toolMode === 'view') {
      const visibleSet = hiddenClasses.size ? new Set(annotations.filter(a => !hiddenClasses.has(a.class_name)).map(a => a.class_name)) : null
      const idx = findAnnotationAt(annotations, visibleSet, ix, iy)
      if (idx >= 0) {
        setSelectedIdxs([idx])
        setToolMode('edit')
      } else {
        setSelectedIdxs([])
      }
    }
  }

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { cx, cy } = getCanvasPos(e)
    setHoverCanvas({ x: cx, y: cy })
    const t = getTransform()
    const { x: ix, y: iy } = canvasToImage(t, cx, cy)

    if (!dragRef.current) {
      // Hover edge insertion preview when polygon selected & in edit mode
      if (toolMode === 'edit' && selectedIdxs.length === 1) {
        const annIdx = selectedIdxs[0]
        const a = annotations[annIdx]
        if (a?.shape_type === 'polygon') {
          const onVertex = findVertexAt(cx, cy, annIdx) >= 0
          if (!onVertex) {
            const edge = findEdgeInsertion(cx, cy, annIdx)
            setHoverEdge(edge ? { annIdx, ...edge } : null)
          } else setHoverEdge(null)
        } else setHoverEdge(null)
      } else setHoverEdge(null)
      return
    }

    const d = dragRef.current

    if (d.action === 'pan' && d.origPan) {
      setPanOffset({ x: d.origPan.x + (cx - d.startX), y: d.origPan.y + (cy - d.startY) })
      return
    }

    if (d.action === 'draw') {
      setDrawDraft(prev => prev ? { kind: prev.kind, data: { ...(prev.data as any), x2: cx, y2: cy } } : null)
      return
    }

    if (d.action === 'move') {
      const dx = (cx - d.startX) / t.scale
      const dy = (cy - d.startY) / t.scale
      setAnnotations(prev => prev.map((a, i) => {
        if (i !== d.annIdx) return a
        if (a.locked) return a
        if (a.shape_type === 'bbox' && d.origBbox) {
          return {
            ...a,
            bbox: {
              x: clamp(d.origBbox.x + dx, 0, imageWidth - d.origBbox.w),
              y: clamp(d.origBbox.y + dy, 0, imageHeight - d.origBbox.h),
              w: d.origBbox.w, h: d.origBbox.h,
            },
          }
        }
        if (a.shape_type === 'polygon' && Array.isArray(d.origPoints)) {
          const newPts = (d.origPoints as number[][]).map(([x, y]) => [
            clamp(x + dx, 0, imageWidth),
            clamp(y + dy, 0, imageHeight),
          ])
          return { ...a, points: newPts, bbox: aabbFromPolygon(newPts) || a.bbox }
        }
        if (a.shape_type === 'keypoint' && Array.isArray(d.origPoints)) {
          const newPts = (d.origPoints as KeypointPoint[]).map(p => ({
            ...p,
            x: clamp(p.x + dx, 0, imageWidth),
            y: clamp(p.y + dy, 0, imageHeight),
          }))
          return { ...a, points: newPts, bbox: aabbFromKeypoints(newPts) || a.bbox }
        }
        if (a.shape_type === 'obb' && d.origPoints && !Array.isArray(d.origPoints)) {
          const obb = d.origPoints as OBBPoints
          const newObb: OBBPoints = { ...obb, cx: obb.cx + dx, cy: obb.cy + dy }
          return { ...a, points: newObb, bbox: aabbFromObb(newObb) }
        }
        return a
      }))
      return
    }

    if (d.action === 'resize' && d.handle && d.origBbox) {
      const dx = (cx - d.startX) / t.scale
      const dy = (cy - d.startY) / t.scale
      const newBbox = resizeBbox(d.origBbox, d.handle, dx, dy, imageWidth, imageHeight, e.shiftKey)
      setAnnotations(prev => prev.map((a, i) => i === d.annIdx ? { ...a, bbox: newBbox } : a))
      return
    }

    if (d.action === 'resize' && typeof d.vertexIdx === 'number' && d.origPoints && !Array.isArray(d.origPoints)) {
      // OBB corner drag → adjust width/height
      const obb = d.origPoints as OBBPoints
      const cosT = Math.cos(obb.theta), sinT = Math.sin(obb.theta)
      const localDx = (ix - obb.cx) * cosT + (iy - obb.cy) * sinT
      const localDy = -(ix - obb.cx) * sinT + (iy - obb.cy) * cosT
      const w = Math.max(8, Math.abs(localDx) * 2)
      const h = Math.max(8, Math.abs(localDy) * 2)
      const newObb: OBBPoints = { ...obb, w, h }
      setAnnotations(prev => prev.map((a, i) => i === d.annIdx ? { ...a, points: newObb, bbox: aabbFromObb(newObb) } : a))
      return
    }

    if (d.action === 'rotate' && d.origPoints && !Array.isArray(d.origPoints)) {
      const obb = d.origPoints as OBBPoints
      const ang = Math.atan2(iy - obb.cy, ix - obb.cx) + Math.PI / 2
      const newObb: OBBPoints = { ...obb, theta: ang }
      setAnnotations(prev => prev.map((a, i) => i === d.annIdx ? { ...a, points: newObb, bbox: aabbFromObb(newObb) } : a))
      return
    }

    if (d.action === 'vertex' && typeof d.vertexIdx === 'number' && Array.isArray(d.origPoints)) {
      const a = annotations[d.annIdx]
      if (!a) return
      let nx = ix, ny = iy
      if (snapToImageEdges) [nx, ny] = snapToEdges(nx, ny, imageWidth, imageHeight)
      if (a.shape_type === 'polygon') {
        const orig = d.origPoints as number[][]
        const newPts = orig.map((p, i) => i === d.vertexIdx ? [clamp(nx, 0, imageWidth), clamp(ny, 0, imageHeight)] : [...p])
        setAnnotations(prev => prev.map((p, i) => i === d.annIdx ? { ...p, points: newPts, bbox: aabbFromPolygon(newPts) || p.bbox } : p))
      } else if (a.shape_type === 'keypoint') {
        const orig = d.origPoints as KeypointPoint[]
        const newPts = orig.map((p, i) => i === d.vertexIdx ? { ...p, x: clamp(nx, 0, imageWidth), y: clamp(ny, 0, imageHeight) } : p)
        setAnnotations(prev => prev.map((p, i) => i === d.annIdx ? { ...p, points: newPts, bbox: aabbFromKeypoints(newPts) || p.bbox } : p))
      }
    }
  }

  const finalizePolygon = (pts: number[][]) => {
    const cls = drawClassName || 'object'
    const bbox = aabbFromPolygon(pts) || { x: 0, y: 0, w: 0, h: 0 }
    const newAnn: LocalAnn = {
      id: -Date.now(), class_name: cls, shape_type: 'polygon',
      bbox, points: pts, confidence: null, source: 'manual',
      review_status: null, review_comment: null, attributes: {}, locked: false, note: null,
    }
    setAnnotations(prev => [...prev, newAnn], true)
    setDrawDraft(null)
    setSelectedIdxs([annotations.length])
    setToolMode('edit')
  }

  const finalizeKeypoints = (pts: KeypointPoint[]) => {
    const cls = drawClassName || 'object'
    const bbox = aabbFromKeypoints(pts) || { x: 0, y: 0, w: 1, h: 1 }
    const newAnn: LocalAnn = {
      id: -Date.now(), class_name: cls, shape_type: 'keypoint',
      bbox, points: pts, confidence: null, source: 'manual',
      review_status: null, review_comment: null, attributes: {}, locked: false, note: null,
    }
    setAnnotations(prev => [...prev, newAnn], true)
    setDrawDraft(null)
    setSelectedIdxs([annotations.length])
    setToolMode('edit')
  }

  const onMouseUp = () => {
    if (!dragRef.current) return
    const d = dragRef.current
    if (d.action === 'draw' && drawDraft) {
      if (drawDraft.kind === 'bbox') {
        const dd = drawDraft.data as { x1: number; y1: number; x2: number; y2: number }
        const t = getTransform()
        const p1 = canvasToImage(t, Math.min(dd.x1, dd.x2), Math.min(dd.y1, dd.y2))
        const p2 = canvasToImage(t, Math.max(dd.x1, dd.x2), Math.max(dd.y1, dd.y2))
        let w = p2.x - p1.x, h = p2.y - p1.y
        if (shiftHeld) {
          const s = Math.min(w, h)
          w = h = s
        }
        if (w > 3 && h > 3) {
          const cls = drawClassName || 'object'
          const bbox: BBox = { x: clamp(p1.x, 0, imageWidth), y: clamp(p1.y, 0, imageHeight), w: Math.min(w, imageWidth - p1.x), h: Math.min(h, imageHeight - p1.y) }
          const newAnn: LocalAnn = {
            id: -Date.now(), class_name: cls, shape_type: 'bbox', bbox, points: null,
            confidence: null, source: 'manual', review_status: null, review_comment: null, attributes: {}, locked: false, note: null,
          }
          setAnnotations(prev => [...prev, newAnn], true)
          setSelectedIdxs([annotations.length])
          setToolMode('edit')
        }
        setDrawDraft(null)
      } else if (drawDraft.kind === 'obb') {
        const dd = drawDraft.data as { x1: number; y1: number; x2: number; y2: number }
        const t = getTransform()
        const p1 = canvasToImage(t, Math.min(dd.x1, dd.x2), Math.min(dd.y1, dd.y2))
        const p2 = canvasToImage(t, Math.max(dd.x1, dd.x2), Math.max(dd.y1, dd.y2))
        const w = p2.x - p1.x, h = p2.y - p1.y
        if (w > 3 && h > 3) {
          const cls = drawClassName || 'object'
          const obb: OBBPoints = { cx: p1.x + w / 2, cy: p1.y + h / 2, w, h, theta: 0 }
          const newAnn: LocalAnn = {
            id: -Date.now(), class_name: cls, shape_type: 'obb', bbox: aabbFromObb(obb), points: obb,
            confidence: null, source: 'manual', review_status: null, review_comment: null, attributes: {}, locked: false, note: null,
          }
          setAnnotations(prev => [...prev, newAnn], true)
          setSelectedIdxs([annotations.length])
          setToolMode('edit')
        }
        setDrawDraft(null)
      }
    }
    dragRef.current = null
  }

  const onMouseLeave = () => {
    setHoverCanvas(null)
    if (dragRef.current) onMouseUp()
  }

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    const newZoom = clamp(zoom * factor, 0.2, 16)
    const { cx, cy } = getCanvasPos(e as any)
    const ratio = newZoom / zoom
    setPanOffset({ x: cx - ratio * (cx - panOffset.x), y: cy - ratio * (cy - panOffset.y) })
    setZoom(newZoom)
  }

  // Mini-map click pan
  const onMinimapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!showMinimap || !imgRef.current) return false
    const canvas = canvasRef.current!
    const minimap = computeMinimapRect(canvas, imgRef.current)
    const { cx, cy } = getCanvasPos(e)
    if (cx >= minimap.x && cx <= minimap.x + minimap.w && cy >= minimap.y && cy <= minimap.y + minimap.h) {
      const fx = (cx - minimap.x) / minimap.w
      const fy = (cy - minimap.y) / minimap.h
      const t = getTransform()
      const targetX = canvas.width / 2 - fx * imgRef.current.width * t.scale
      const targetY = canvas.height / 2 - fy * imgRef.current.height * t.scale
      const b = baseTransformRef.current
      setPanOffset({ x: targetX - b.offsetX * zoom, y: targetY - b.offsetY * zoom })
      return true
    }
    return false
  }

  const onCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (showMinimap && onMinimapClick(e)) return
    onMouseDown(e)
  }

  const cursorStyle = useMemo(() => {
    if (toolMode.startsWith('draw')) return 'crosshair'
    if (toolMode === 'smart') return 'crosshair'
    if (toolMode === 'edit') return 'default'
    return 'grab'
  }, [toolMode])

  return (
    <canvas
      ref={canvasRef}
      width={DEFAULT_CANVAS_W}
      height={DEFAULT_CANVAS_H}
      style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: cursorStyle }}
      onMouseDown={onCanvasMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onWheel={onWheel}
      onContextMenu={e => e.preventDefault()}
    />
  )
})

function drawShape(
  ctx: CanvasRenderingContext2D, t: CanvasTransform, a: LocalAnn,
  color: string, isSelected: boolean, kpSchema: KeypointSchema | null,
) {
  const lockedDash: number[] = a.locked ? [3, 3] : []
  const reviewDash: number[] = a.review_status === 'rejected' || a.review_status === 'needs_adjustment' ? [6, 4] : []
  const dash = lockedDash.length ? lockedDash : reviewDash
  const stroke = a.review_status === 'rejected' ? '#B3261E'
    : a.review_status === 'needs_adjustment' ? '#E8A317'
    : color

  ctx.save()
  ctx.lineWidth = isSelected ? 3 : 2
  ctx.strokeStyle = stroke
  ctx.setLineDash(dash)

  if (a.shape_type === 'bbox' && a.bbox) {
    const p = imageToCanvas(t, a.bbox.x, a.bbox.y)
    const w = a.bbox.w * t.scale, h = a.bbox.h * t.scale
    ctx.strokeRect(p.x, p.y, w, h)
    ctx.fillStyle = color
    ctx.globalAlpha = 0.1
    ctx.fillRect(p.x, p.y, w, h)
    ctx.globalAlpha = 1
    drawLabel(ctx, p.x, p.y, formatLabel(a, color), stroke)
    if (isSelected) {
      const handles = getBboxHandlePositions(p.x, p.y, w, h)
      handles.forEach(hd => drawHandle(ctx, hd.x, hd.y, color))
    }
  } else if (a.shape_type === 'polygon' && Array.isArray(a.points)) {
    const pts = a.points as number[][]
    if (pts.length < 2) { ctx.restore(); return }
    ctx.beginPath()
    pts.forEach((p, i) => {
      const c = imageToCanvas(t, p[0], p[1])
      if (i === 0) ctx.moveTo(c.x, c.y)
      else ctx.lineTo(c.x, c.y)
    })
    ctx.closePath()
    ctx.stroke()
    ctx.fillStyle = color
    ctx.globalAlpha = 0.12
    ctx.fill()
    ctx.globalAlpha = 1
    const first = imageToCanvas(t, pts[0][0], pts[0][1])
    drawLabel(ctx, first.x, first.y, formatLabel(a, color), stroke)
    if (isSelected) {
      pts.forEach(p => {
        const c = imageToCanvas(t, p[0], p[1])
        drawHandle(ctx, c.x, c.y, color, 'circle', VERTEX_HANDLE_SIZE)
      })
    }
  } else if (a.shape_type === 'keypoint' && Array.isArray(a.points)) {
    const pts = a.points as KeypointPoint[]
    const skeleton = kpSchema?.skeleton || []
    ctx.lineWidth = 2
    skeleton.forEach(([i, j]) => {
      if (pts[i] && pts[j] && pts[i].v > 0 && pts[j].v > 0) {
        const c1 = imageToCanvas(t, pts[i].x, pts[i].y)
        const c2 = imageToCanvas(t, pts[j].x, pts[j].y)
        ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.stroke()
      }
    })
    pts.forEach((p, i) => {
      const c = imageToCanvas(t, p.x, p.y)
      const fill = p.v === 1 ? '#9ca3af' : color
      drawHandle(ctx, c.x, c.y, fill, 'circle', isSelected ? 8 : 6)
      if (isSelected) {
        ctx.fillStyle = '#fff'
        ctx.font = '11px sans-serif'
        ctx.fillText(p.name || kpSchema?.names[i] || `kp${i + 1}`, c.x + 8, c.y - 6)
      }
    })
    if (a.bbox) {
      drawLabel(ctx, imageToCanvas(t, a.bbox.x, a.bbox.y).x, imageToCanvas(t, a.bbox.x, a.bbox.y).y, formatLabel(a, color), stroke)
    }
  } else if (a.shape_type === 'obb' && a.points && !Array.isArray(a.points)) {
    const obb = a.points as OBBPoints
    const corners = obbToCorners(obb)
    ctx.beginPath()
    corners.forEach(([cx, cy], i) => {
      const c = imageToCanvas(t, cx, cy)
      if (i === 0) ctx.moveTo(c.x, c.y)
      else ctx.lineTo(c.x, c.y)
    })
    ctx.closePath()
    ctx.stroke()
    ctx.fillStyle = color
    ctx.globalAlpha = 0.12
    ctx.fill()
    ctx.globalAlpha = 1
    const cMid = imageToCanvas(t, corners[0][0], corners[0][1])
    drawLabel(ctx, cMid.x, cMid.y, formatLabel(a, color), stroke)
    if (isSelected) {
      corners.forEach(([cx, cy]) => {
        const c = imageToCanvas(t, cx, cy)
        drawHandle(ctx, c.x, c.y, color)
      })
      const topMid = [(corners[0][0] + corners[1][0]) / 2, (corners[0][1] + corners[1][1]) / 2]
      const dx = Math.cos(obb.theta - Math.PI / 2) * 30 / t.scale
      const dy = Math.sin(obb.theta - Math.PI / 2) * 30 / t.scale
      const tm = imageToCanvas(t, topMid[0], topMid[1])
      const rh = imageToCanvas(t, topMid[0] + dx, topMid[1] + dy)
      ctx.beginPath(); ctx.moveTo(tm.x, tm.y); ctx.lineTo(rh.x, rh.y); ctx.stroke()
      drawHandle(ctx, rh.x, rh.y, '#22c55e', 'circle', 9)
    }
  }
  ctx.restore()
}

function drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, kind: 'square' | 'circle' = 'square', size = HANDLE_SIZE) {
  ctx.save()
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  if (kind === 'circle') {
    ctx.beginPath(); ctx.arc(x, y, size / 2 + 1, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  } else {
    ctx.fillRect(x - size / 2, y - size / 2, size, size)
    ctx.strokeRect(x - size / 2, y - size / 2, size, size)
  }
  ctx.restore()
}

function formatLabel(a: LocalAnn, _color: string) {
  let s = a.class_name
  if (a.confidence) s += ` ${(a.confidence * 100).toFixed(0)}%`
  if (a.locked) s = '🔒 ' + s
  const flags: string[] = []
  if (a.attributes?.occluded) flags.push('occ')
  if (a.attributes?.truncated) flags.push('trunc')
  if (a.attributes?.blur) flags.push('blur')
  if (flags.length) s += ` [${flags.join(',')}]`
  return s
}

function drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, bg: string) {
  ctx.save()
  ctx.font = '12px "Google Sans", Inter, sans-serif'
  const w = ctx.measureText(text).width
  const h = 20
  ctx.fillStyle = bg
  roundRect(ctx, x, y - h, w + 10, h, 4)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.fillText(text, x + 5, y - 6)
  ctx.restore()
}

function drawLoupe(
  ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, image: HTMLImageElement,
  t: CanvasTransform, hover: { x: number; y: number }, brightness: number, contrast: number,
) {
  const size = 140
  const margin = 12
  const lx = canvas.width - size - margin
  const ly = margin
  const zoom = 4
  const sourceImgX = (hover.x - t.offsetX) / t.scale
  const sourceImgY = (hover.y - t.offsetY) / t.scale
  const srcW = size / zoom
  const sx = sourceImgX - srcW / 2
  const sy = sourceImgY - srcW / 2

  ctx.save()
  // background
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(lx, ly, size, size)
  // image patch
  if (brightness !== 100 || contrast !== 100) try { ctx.filter = `brightness(${brightness / 100}) contrast(${contrast / 100})` } catch {}
  try {
    ctx.drawImage(image, sx, sy, srcW, srcW, lx, ly, size, size)
  } catch {}
  if (brightness !== 100 || contrast !== 100) try { ctx.filter = 'none' } catch {}
  // crosshair
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(lx + size / 2, ly); ctx.lineTo(lx + size / 2, ly + size)
  ctx.moveTo(lx, ly + size / 2); ctx.lineTo(lx + size, ly + size / 2)
  ctx.stroke()
  // border
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 1
  ctx.strokeRect(lx, ly, size, size)
  ctx.restore()
}

function computeMinimapRect(canvas: HTMLCanvasElement, image: HTMLImageElement) {
  const w = 160
  const h = Math.round((image.height / image.width) * w)
  const margin = 12
  return { x: margin, y: canvas.height - h - margin, w, h }
}

function drawMinimap(
  ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, image: HTMLImageElement,
  t: CanvasTransform, primaryColor: string, _divider: string,
) {
  const r = computeMinimapRect(canvas, image)
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8)
  try { ctx.drawImage(image, r.x, r.y, r.w, r.h) } catch {}
  // viewport rectangle in image coords
  const viewX0 = -t.offsetX / t.scale
  const viewY0 = -t.offsetY / t.scale
  const viewX1 = (canvas.width - t.offsetX) / t.scale
  const viewY1 = (canvas.height - t.offsetY) / t.scale
  const fx = (x: number) => r.x + (x / image.width) * r.w
  const fy = (y: number) => r.y + (y / image.height) * r.h
  ctx.strokeStyle = primaryColor
  ctx.lineWidth = 2
  ctx.strokeRect(fx(viewX0), fy(viewY0), fx(viewX1) - fx(viewX0), fy(viewY1) - fy(viewY0))
  ctx.restore()
}

export default AnnotationCanvas
