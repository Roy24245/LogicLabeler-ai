import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export interface Dataset {
  id: number
  name: string
  description: string
  task_type: string
  label_classes: string[]
  image_count: number
  annotation_count: number
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
  created_at: string
}

export interface AnnotationItem {
  id: number
  image_id: number
  class_name: string
  bbox: { x: number; y: number; w: number; h: number } | null
  confidence: number | null
  source: string
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

export interface Settings {
  dashscope_api_key: string
  dashscope_api_key_set: boolean
  soldier_mode: string
  augmentation_enabled: boolean
}

// Datasets
export const getDatasets = () => api.get<Dataset[]>('/datasets')
export const getDataset = (id: number) => api.get<Dataset>(`/datasets/${id}`)
export const createDataset = (data: { name: string; description?: string; task_type?: string; label_classes?: string[] }) =>
  api.post<Dataset>('/datasets', data)
export const deleteDataset = (id: number) => api.delete(`/datasets/${id}`)
export const importDataset = (id: number, file: File, format: string) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post(`/datasets/${id}/import?format=${format}`, fd)
}
export const exportDataset = (id: number) =>
  api.get(`/datasets/${id}/export?format=yolo`, { responseType: 'blob' })

// Images
export const getImages = (datasetId: number, skip = 0, limit = 50) =>
  api.get<ImageItem[]>(`/datasets/${datasetId}/images?skip=${skip}&limit=${limit}`)
export const uploadImages = (datasetId: number, files: File[]) => {
  const fd = new FormData()
  files.forEach(f => fd.append('files', f))
  return api.post<ImageItem[]>(`/datasets/${datasetId}/images`, fd)
}
export const deleteImage = (id: number) => api.delete(`/images/${id}`)

// Annotations
export const getAnnotations = (imageId: number) =>
  api.get<AnnotationItem[]>(`/images/${imageId}/annotations`)
export const updateAnnotations = (imageId: number, annotations: Omit<AnnotationItem, 'id' | 'image_id'>[]) =>
  api.put<AnnotationItem[]>(`/images/${imageId}/annotations`, annotations)

// Labeling
export const runLabeling = (data: {
  dataset_id: number
  instruction: string
  soldier_mode?: string
  use_sahi?: boolean
  use_rag?: boolean
}) => api.post('/labeling/run', data)
export const getLabelingStatus = (jobId: number) => api.get(`/labeling/status/${jobId}`)
export const getLabelingJobs = () => api.get('/labeling/jobs')

// Training
export const startTraining = (data: {
  dataset_id: number
  model_type?: string
  epochs?: number
  batch_size?: number
  img_size?: number
}) => api.post('/training/start', data)
export const getTrainingJobs = () => api.get<TrainingJobItem[]>('/training/jobs')
export const getTrainingJob = (id: number) => api.get<TrainingJobItem>(`/training/jobs/${id}`)
export const stopTraining = (id: number) => api.post(`/training/jobs/${id}/stop`)
export const getTrainingMetrics = (id: number) => api.get(`/training/jobs/${id}/metrics`)
export const getTrainingArtifacts = (id: number) => api.get(`/training/jobs/${id}/artifacts`)
export const getTrainingLog = (id: number) => api.get<{ log: string }>(`/training/jobs/${id}/log`)

// Augmentation
export const runAugmentation = (data: {
  dataset_id: number
  variation_types: string[]
  image_ids?: number[]
}) => api.post('/augmentation/run', data)

// Settings
export const getSettings = () => api.get<Settings>('/settings')
export const updateSettings = (data: Partial<Settings>) => api.put('/settings', data)

// Health
export const healthCheck = () => api.get('/health')

export default api
