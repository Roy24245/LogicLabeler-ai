import type { BBox, BboxHandle, CanvasTransform, KeypointPoint, LocalAnn, OBBPoints } from './types'
import { HANDLE_SIZE } from './types'

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

export function imageToCanvas(t: CanvasTransform, ix: number, iy: number) {
  return { x: ix * t.scale + t.offsetX, y: iy * t.scale + t.offsetY }
}

export function canvasToImage(t: CanvasTransform, cx: number, cy: number) {
  return { x: (cx - t.offsetX) / t.scale, y: (cy - t.offsetY) / t.scale }
}

export function getBboxHandlePositions(x: number, y: number, w: number, h: number) {
  return [
    { name: 'tl' as BboxHandle, x, y },
    { name: 'tr' as BboxHandle, x: x + w, y },
    { name: 'bl' as BboxHandle, x, y: y + h },
    { name: 'br' as BboxHandle, x: x + w, y: y + h },
    { name: 'tm' as BboxHandle, x: x + w / 2, y },
    { name: 'bm' as BboxHandle, x: x + w / 2, y: y + h },
    { name: 'ml' as BboxHandle, x, y: y + h / 2 },
    { name: 'mr' as BboxHandle, x: x + w, y: y + h / 2 },
  ]
}

export function findBboxHandle(canvasX: number, canvasY: number, posX: number, posY: number, w: number, h: number): BboxHandle | null {
  const handles = getBboxHandlePositions(posX, posY, w, h)
  for (const hd of handles) {
    if (Math.abs(canvasX - hd.x) <= HANDLE_SIZE && Math.abs(canvasY - hd.y) <= HANDLE_SIZE) return hd.name
  }
  return null
}

export function resizeBbox(orig: BBox, handle: BboxHandle, dx: number, dy: number, maxW: number, maxH: number, keepRatio = false): BBox {
  let { x, y, w, h } = orig
  switch (handle) {
    case 'tl': x += dx; y += dy; w -= dx; h -= dy; break
    case 'tr': w += dx; y += dy; h -= dy; break
    case 'bl': x += dx; w -= dx; h += dy; break
    case 'br': w += dx; h += dy; break
    case 'tm': y += dy; h -= dy; break
    case 'bm': h += dy; break
    case 'ml': x += dx; w -= dx; break
    case 'mr': w += dx; break
  }
  if (keepRatio) {
    const ratio = orig.w / Math.max(1, orig.h)
    if (handle === 'tl' || handle === 'tr' || handle === 'bl' || handle === 'br') {
      const nw = Math.max(Math.abs(w), Math.abs(h) * ratio)
      const nh = nw / ratio
      if (handle === 'tl') { x = orig.x + orig.w - nw; y = orig.y + orig.h - nh }
      else if (handle === 'tr') { y = orig.y + orig.h - nh }
      else if (handle === 'bl') { x = orig.x + orig.w - nw }
      w = nw; h = nh
    }
  }
  if (w < 5) w = 5
  if (h < 5) h = 5
  x = clamp(x, 0, maxW - 5)
  y = clamp(y, 0, maxH - 5)
  w = Math.min(w, maxW - x)
  h = Math.min(h, maxH - y)
  return { x, y, w, h }
}

export function aabbFromPolygon(points: number[][]): BBox | null {
  if (!points || !points.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) }
}

export function aabbFromKeypoints(points: KeypointPoint[]): BBox | null {
  const visible = points.filter(p => (p.v ?? 2) > 0)
  if (!visible.length) return null
  return aabbFromPolygon(visible.map(p => [p.x, p.y]))
}

export function obbToCorners(obb: OBBPoints): number[][] {
  const cos = Math.cos(obb.theta)
  const sin = Math.sin(obb.theta)
  const half: [number, number][] = [
    [-obb.w / 2, -obb.h / 2],
    [obb.w / 2, -obb.h / 2],
    [obb.w / 2, obb.h / 2],
    [-obb.w / 2, obb.h / 2],
  ]
  return half.map(([dx, dy]) => [obb.cx + dx * cos - dy * sin, obb.cy + dx * sin + dy * cos])
}

export function aabbFromObb(obb: OBBPoints): BBox {
  const corners = obbToCorners(obb)
  return aabbFromPolygon(corners)!
}

export function pointInPolygon(px: number, py: number, points: number[][]): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0], yi = points[i][1]
    const xj = points[j][0], yj = points[j][1]
    const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-9) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

export function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / len2
  t = clamp(t, 0, 1)
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export function findAnnotationAt(annotations: LocalAnn[], visibleClasses: Set<string> | null, ix: number, iy: number): number {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const a = annotations[i]
    if (visibleClasses && !visibleClasses.has(a.class_name)) continue
    if (a.shape_type === 'polygon' && Array.isArray(a.points)) {
      if (pointInPolygon(ix, iy, a.points as number[][])) return i
    } else if (a.shape_type === 'obb' && a.points && !Array.isArray(a.points)) {
      const corners = obbToCorners(a.points as OBBPoints)
      if (pointInPolygon(ix, iy, corners)) return i
    } else if (a.bbox) {
      const { x, y, w, h } = a.bbox
      if (ix >= x && ix <= x + w && iy >= y && iy <= y + h) return i
    }
  }
  return -1
}

export function snapToEdges(x: number, y: number, imgW: number, imgH: number, snapPx = 5): [number, number] {
  if (Math.abs(x) < snapPx) x = 0
  if (Math.abs(y) < snapPx) y = 0
  if (Math.abs(x - imgW) < snapPx) x = imgW
  if (Math.abs(y - imgH) < snapPx) y = imgH
  return [x, y]
}

export function ensureBboxFromShape(a: LocalAnn): BBox | null {
  if (a.shape_type === 'polygon' && Array.isArray(a.points)) {
    return aabbFromPolygon(a.points as number[][]) || a.bbox
  }
  if (a.shape_type === 'keypoint' && Array.isArray(a.points)) {
    return aabbFromKeypoints(a.points as KeypointPoint[]) || a.bbox
  }
  if (a.shape_type === 'obb' && a.points && !Array.isArray(a.points)) {
    return aabbFromObb(a.points as OBBPoints)
  }
  return a.bbox
}
