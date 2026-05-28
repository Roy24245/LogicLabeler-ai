import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export interface KeypointSchema {
  names: string[]
  skeleton: [number, number][]
}

export interface Dataset {
  id: number
  name: string
  description: string
  task_type: string
  label_classes: string[]
  keypoint_schema?: KeypointSchema | null
  image_count: number
  annotation_count: number
  labeled_image_count: number
  created_at: string
}

export interface ImageItem {
  id: number
  dataset_id: number
  filename: string
  url: string
  width: number
  height: number
  is_augmented: boolean
  split: string | null
  verified?: boolean
  tags?: string[]
  note?: string | null
  annotation_count: number
  created_at: string
}

export type ShapeType = 'bbox' | 'polygon' | 'keypoint' | 'obb'

export interface BBox { x: number; y: number; w: number; h: number }

export interface KeypointPoint { x: number; y: number; v: number; name?: string }

export interface OBBPoints { cx: number; cy: number; w: number; h: number; theta: number }

export interface AnnotationAttributes {
  occluded?: boolean
  truncated?: boolean
  blur?: boolean
  custom?: Record<string, unknown>
  [key: string]: unknown
}

export interface AnnotationItem {
  id: number
  image_id: number
  class_name: string
  shape_type: ShapeType
  bbox: BBox | null
  points: number[][] | KeypointPoint[] | OBBPoints | null
  confidence: number | null
  source: string
  review_status: 'approved' | 'rejected' | 'needs_adjustment' | null
  review_comment: string | null
  attributes: AnnotationAttributes
  locked: boolean
  note: string | null
}

export interface TrainingJobItem {
  id: number
  dataset_id: number
  model_type: string
  status: string
  epochs: number
  batch_size: number
  img_size: number
  metrics: Record<string, number[]>
  log_path: string | null
  best_model_path: string | null
  run_dir: string | null
  created_at: string
}

export interface ActiveModel {
  provider_id: string
  model: string
}

export interface Settings {
  dashscope_api_key: string
  dashscope_api_key_set: boolean
  soldier_mode: string
  augmentation_enabled: boolean
  active_text_model: ActiveModel
  active_vision_model: ActiveModel
  active_soldier_model: ActiveModel
}

export interface ModelProvider {
  id: string
  name: string
  type: 'dashscope' | 'openai' | 'anthropic'
  base_url: string
  models: string[]
  builtin: boolean
  api_key_set: boolean
}

export interface ProviderCreatePayload {
  name: string
  type: 'openai' | 'anthropic'
  api_key: string
  base_url?: string
  models?: string[]
}

export interface ProviderUpdatePayload {
  name?: string
  api_key?: string
  base_url?: string
  models?: string[]
}

export interface DatasetStats {
  class_distribution: Record<string, number>
  annotation_sources: Record<string, number>
  labeled_images: number
  unlabeled_images: number
  total_annotations: number
  image_sizes: { w: number; h: number }[]
  annotations_per_image: number[]
  split_distribution: Record<string, number>
}

export interface ImageListResponse {
  images: ImageItem[]
  total: number
}

// Datasets
export const getDatasets = () => api.get<Dataset[]>('/datasets')
export const getDataset = (id: number) => api.get<Dataset>(`/datasets/${id}`)
export const createDataset = (data: { name: string; description?: string; task_type?: string; label_classes?: string[] }) =>
  api.post<Dataset>('/datasets', data)
export const updateDataset = (id: number, data: { name?: string; description?: string; task_type?: string; label_classes?: string[] | null; keypoint_schema?: KeypointSchema | null }) =>
  api.put<Dataset>(`/datasets/${id}`, data)
export const deleteDataset = (id: number) => api.delete(`/datasets/${id}`)
export const importDataset = (id: number, file: File, format: string) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post(`/datasets/${id}/import?format=${format}`, fd)
}
export const exportDataset = (id: number, augmentations?: string[], preprocessing?: Record<string, any>) => {
  if (augmentations?.length || (preprocessing && Object.keys(preprocessing).length)) {
    return api.post(`/datasets/${id}/export`, {
      format: 'yolo',
      augmentations: augmentations || [],
      preprocessing: preprocessing || {},
    }, { responseType: 'blob' })
  }
  return api.get(`/datasets/${id}/export?format=yolo`, { responseType: 'blob' })
}

// Images
export const getImages = (datasetId: number, skip = 0, limit = 50, filters?: { labeled?: boolean; class_name?: string; split?: string; search?: string }) => {
  const params = new URLSearchParams({ skip: String(skip), limit: String(limit) })
  if (filters?.labeled !== undefined) params.set('labeled', String(filters.labeled))
  if (filters?.class_name) params.set('class_name', filters.class_name)
  if (filters?.split) params.set('split', filters.split)
  if (filters?.search) params.set('search', filters.search)
  return api.get<ImageListResponse>(`/datasets/${datasetId}/images?${params}`)
}
export const uploadImages = (datasetId: number, files: File[]) => {
  const fd = new FormData()
  files.forEach(f => fd.append('files', f))
  return api.post<ImageItem[]>(`/datasets/${datasetId}/images`, fd)
}
export const deleteImage = (id: number) => api.delete(`/images/${id}`)
export const updateImage = (id: number, data: { split?: string | null }) =>
  api.put<ImageItem>(`/images/${id}`, data)
export const updateImageMeta = (id: number, data: { verified?: boolean; tags?: string[]; note?: string | null; split?: string | null }) =>
  api.put<ImageItem>(`/images/${id}/meta`, data)
export const batchDeleteImages = (datasetId: number, imageIds: number[]) =>
  api.post(`/datasets/${datasetId}/images/batch-delete`, { image_ids: imageIds })
export const convertImagesToJpg = (datasetId: number) =>
  api.post<{ ok: boolean; converted: number }>(`/datasets/${datasetId}/images/convert-jpg`)

// Annotations
export type AnnotationPayload = {
  class_name: string
  shape_type?: ShapeType
  bbox?: BBox | null
  points?: number[][] | KeypointPoint[] | OBBPoints | null
  confidence?: number | null
  source?: string
  attributes?: AnnotationAttributes
  locked?: boolean
  note?: string | null
}
export const getAnnotations = (imageId: number) =>
  api.get<AnnotationItem[]>(`/images/${imageId}/annotations`)
export const updateAnnotations = (imageId: number, annotations: AnnotationPayload[]) =>
  api.put<AnnotationItem[]>(`/images/${imageId}/annotations`, annotations)

// AI assist
export interface SegmentResult {
  success: boolean
  points?: [number, number][]
  bbox?: BBox
  error?: string
}
export const assistSegment = (data: { image_id: number; type: 'click' | 'bbox'; point?: [number, number]; bbox?: BBox }) =>
  api.post<SegmentResult>('/assist/segment', data)

export interface AutoLabelResult {
  success: boolean
  detections: { class_name: string; bbox: BBox; confidence: number }[]
  model?: {
    role: string
    provider_id: string
    provider_name: string
    provider_type: string
    model: string
  }
}
export const assistAutolabelImage = (data: { image_id: number; classes?: string[]; instruction?: string; mode?: string }) =>
  api.post<AutoLabelResult>('/assist/autolabel-image', data)

// Class management
export const renameClass = (datasetId: number, oldName: string, newName: string) =>
  api.post(`/datasets/${datasetId}/classes/rename`, { old_name: oldName, new_name: newName })
export const mergeClasses = (datasetId: number, source: string, target: string) =>
  api.post(`/datasets/${datasetId}/classes/merge`, { source, target })
export const deleteClass = (datasetId: number, className: string) =>
  api.delete(`/datasets/${datasetId}/classes/${encodeURIComponent(className)}`)

// Stats
export const getDatasetStats = (datasetId: number) =>
  api.get<DatasetStats>(`/datasets/${datasetId}/stats`)

// Split management
export const autoSplit = (datasetId: number, trainRatio = 0.7, valRatio = 0.2, testRatio = 0.1) =>
  api.post(`/datasets/${datasetId}/auto-split`, { train_ratio: trainRatio, val_ratio: valRatio, test_ratio: testRatio })
export const batchSplit = (datasetId: number, imageIds: number[], split: string | null) =>
  api.put(`/datasets/${datasetId}/batch-split`, { image_ids: imageIds, split })

// Labeling
export interface CurrentImagePreview {
  image_id: number
  filename: string
  url: string
  width: number
  height: number
  index: number
  annotations: {
    class_name: string
    bbox: { x: number; y: number; w: number; h: number } | null
    confidence: number | null
    review_status?: string
    review_comment?: string
  }[]
}

export interface LabelingStatusResponse {
  job_id: number
  status: string
  total_images: number
  processed_images: number
  logs: string[]
  current_image: CurrentImagePreview | null
}

export interface ReviewStatusResponse {
  job_id: number
  status: string
  total_images: number
  processed_images: number
  results_summary: { approved: number; rejected: number; needs_adjustment: number } | null
  logs: string[]
  current_image: CurrentImagePreview | null
}

export const runLabeling = (data: {
  dataset_id: number
  instruction: string
  soldier_mode?: string
  use_sahi?: boolean
  use_rag?: boolean
}) => api.post('/labeling/run', data)
export const getLabelingStatus = (jobId: number) => api.get<LabelingStatusResponse>(`/labeling/status/${jobId}`)
export const getLabelingJobs = () => api.get('/labeling/jobs')

// Prompt optimizer
export interface PromptSuggestion {
  label: string
  title: string
  text: string
}
export const optimizePrompt = (instruction: string) =>
  api.post<{ suggestions: PromptSuggestion[] }>('/labeling/optimize-prompt', { instruction })

// AI Review
export const runReview = (data: { dataset_id: number; image_ids?: number[] }) =>
  api.post('/labeling/review', data)
export const getReviewStatus = (jobId: number) =>
  api.get<ReviewStatusResponse>(`/labeling/review/${jobId}`)
export const applyReviewFixes = (jobId: number) =>
  api.post(`/labeling/review/${jobId}/apply`)

// Preprocessing
export interface TransformInfo {
  id: string
  label: string
  category: string
}
export const getAvailableTransforms = () =>
  api.get<{ augmentations: TransformInfo[]; preprocessing: TransformInfo[] }>('/preprocessing/transforms')

// Training
export const startTraining = (data: {
  dataset_id: number
  model_type?: string
  epochs?: number
  batch_size?: number
  img_size?: number
  preprocess?: {
    preprocessing: Record<string, any>
    augmentations: string[]
  }
}) => api.post('/training/start', data)
export const getTrainingJobs = () => api.get<TrainingJobItem[]>('/training/jobs')
export const getTrainingJob = (id: number) => api.get<TrainingJobItem>(`/training/jobs/${id}`)
export const stopTraining = (id: number) => api.post(`/training/jobs/${id}/stop`)
export const resumeTraining = (id: number) => api.post<TrainingJobItem>(`/training/jobs/${id}/resume`)
export const cancelTraining = (id: number) => api.post(`/training/jobs/${id}/cancel`)
export const deleteTrainingJob = (id: number) => api.delete(`/training/jobs/${id}`)
export const getTrainingMetrics = (id: number) => api.get(`/training/jobs/${id}/metrics`)
export const getTrainingArtifacts = (id: number) => api.get(`/training/jobs/${id}/artifacts`)
export const getTrainingLog = (id: number) => api.get<{ log: string }>(`/training/jobs/${id}/log`)

// Augmentation
export interface AugJobStatus {
  id: number
  status: 'pending' | 'augmenting' | 'labeling' | 'completed' | 'failed'
  total: number
  processed: number
  successfully_created: number
  labeled_count: number
  total_annotations: number
  auto_label: boolean
  logs: string[]
  error: string | null
}
export const runAugmentation = (data: {
  dataset_id: number
  variation_types: string[]
  image_ids?: number[]
  auto_label?: boolean
  label_instruction?: string
}) => api.post<{ job_id: number; total_requested: number; status: string; message: string }>('/augmentation/run', data)
export const getAugmentationJob = (jobId: number) =>
  api.get<AugJobStatus>(`/augmentation/jobs/${jobId}`)

// Settings
export const getSettings = () => api.get<Settings>('/settings')
export const updateSettings = (data: Partial<Settings>) => api.put('/settings', data)

// Model providers
export const getProviders = () => api.get<ModelProvider[]>('/settings/providers')
export const createProvider = (data: ProviderCreatePayload) =>
  api.post<ModelProvider>('/settings/providers', data)
export const updateProvider = (id: string, data: ProviderUpdatePayload) =>
  api.put(`/settings/providers/${id}`, data)
export const deleteProvider = (id: string) => api.delete(`/settings/providers/${id}`)
export const setActiveModel = (data: { role: 'text' | 'vision' | 'soldier'; provider_id: string; model: string }) =>
  api.put('/settings/active-model', data)

// Health
export const healthCheck = () => api.get('/health')

export default api
