import type {
  AnnotationAttributes,
  AnnotationItem,
  BBox,
  KeypointPoint,
  KeypointSchema,
  OBBPoints,
  ShapeType,
} from '../../api/client'

export type {
  AnnotationAttributes,
  BBox,
  KeypointPoint,
  KeypointSchema,
  OBBPoints,
  ShapeType,
}

export type ToolMode =
  | 'view'
  | 'edit'
  | 'draw-bbox'
  | 'draw-polygon'
  | 'draw-keypoint'
  | 'draw-obb'
  | 'smart'

export interface LocalAnn {
  id: number
  class_name: string
  shape_type: ShapeType
  bbox: BBox | null
  points: number[][] | KeypointPoint[] | OBBPoints | null
  confidence: number | null
  source: string
  review_status: string | null
  review_comment: string | null
  attributes: AnnotationAttributes
  locked: boolean
  note: string | null
}

export type DragAction =
  | 'none'
  | 'draw'
  | 'move'
  | 'resize'
  | 'pan'
  | 'rotate'
  | 'vertex'

export type BboxHandle =
  | 'tl'
  | 'tr'
  | 'bl'
  | 'br'
  | 'tm'
  | 'bm'
  | 'ml'
  | 'mr'

export interface CanvasTransform {
  scale: number
  offsetX: number
  offsetY: number
}

export interface DragState {
  action: DragAction
  startX: number
  startY: number
  origBbox?: BBox
  origPoints?: number[][] | KeypointPoint[] | OBBPoints | null
  origPan?: { x: number; y: number }
  handle?: BboxHandle | null
  vertexIdx?: number
  annIdx: number
}

export const COLORS = ['#6750A4', '#0061A4', '#7D5260', '#1B8755', '#E8A317', '#B3261E', '#625B71', '#00677E', '#984061', '#006D2F']
export const HANDLE_SIZE = 8

export function fromApiAnnotation(a: AnnotationItem): LocalAnn {
  return {
    id: a.id,
    class_name: a.class_name,
    shape_type: (a.shape_type as ShapeType) || 'bbox',
    bbox: a.bbox,
    points: a.points,
    confidence: a.confidence,
    source: a.source,
    review_status: a.review_status,
    review_comment: a.review_comment,
    attributes: a.attributes || {},
    locked: !!a.locked,
    note: a.note ?? null,
  }
}

export function toApiAnnotation(a: LocalAnn) {
  return {
    class_name: a.class_name,
    shape_type: a.shape_type,
    bbox: a.bbox,
    points: a.points,
    confidence: a.confidence,
    source: a.source,
    attributes: a.attributes,
    locked: a.locked,
    note: a.note,
  }
}
