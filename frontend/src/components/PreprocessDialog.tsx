import { useEffect, useState, useCallback } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Box, Typography, Grid, Card, CardActionArea, CardContent,
  Switch, FormControlLabel, Divider, Chip, Tooltip, Alert,
  TextField, Tabs, Tab, IconButton,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import CropIcon from '@mui/icons-material/Crop'
import RotateRightIcon from '@mui/icons-material/RotateRight'
import Rotate90DegreesCwIcon from '@mui/icons-material/Rotate90DegreesCw'
import FlipIcon from '@mui/icons-material/Flip'
import BrightnessHighIcon from '@mui/icons-material/BrightnessHigh'
import ExposureIcon from '@mui/icons-material/Exposure'
import BlurOnIcon from '@mui/icons-material/BlurOn'
import GrainIcon from '@mui/icons-material/Grain'
import BlurLinearIcon from '@mui/icons-material/BlurLinear'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import GridOnIcon from '@mui/icons-material/GridOn'
import InvertColorsIcon from '@mui/icons-material/InvertColors'
import ContrastIcon from '@mui/icons-material/Contrast'
import ViewModuleIcon from '@mui/icons-material/ViewModule'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import FilterBAndWIcon from '@mui/icons-material/FilterBAndW'
import BlockIcon from '@mui/icons-material/Block'
import PhotoSizeSelectLargeIcon from '@mui/icons-material/PhotoSizeSelectLarge'
import { getAvailableTransforms } from '../api/client'

const AUGMENT_ICONS: Record<string, React.ReactElement> = {
  flip_horizontal: <FlipIcon />,
  flip_vertical: <FlipIcon sx={{ transform: 'rotate(90deg)' }} />,
  rotate_90: <Rotate90DegreesCwIcon />,
  rotation: <RotateRightIcon />,
  crop: <CropIcon />,
  shear: <ViewModuleIcon />,
  brightness: <BrightnessHighIcon />,
  exposure: <ExposureIcon />,
  blur: <BlurOnIcon />,
  noise: <GrainIcon />,
  motion_blur: <BlurLinearIcon />,
  cutout: <VisibilityOffIcon />,
  mosaic: <GridOnIcon />,
  grayscale: <InvertColorsIcon />,
  auto_contrast: <ContrastIcon />,
}

const PREPROCESS_ICONS: Record<string, React.ReactElement> = {
  auto_orient: <AutoFixHighIcon />,
  resize: <PhotoSizeSelectLargeIcon />,
  tile: <ViewModuleIcon />,
  grayscale: <FilterBAndWIcon />,
  auto_contrast: <ContrastIcon />,
  filter_null: <BlockIcon />,
}

interface PreprocessDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (config: {
    augmentations: string[]
    preprocessing: Record<string, any>
  }) => void
  title?: string
  confirmLabel?: string
}

export default function PreprocessDialog({
  open,
  onClose,
  onConfirm,
  title = '預處理與增強配置',
  confirmLabel = '確認',
}: PreprocessDialogProps) {
  const [tab, setTab] = useState(0)
  const [selectedAug, setSelectedAug] = useState<Set<string>>(new Set())
  const [preprocessing, setPreprocessing] = useState<Record<string, any>>({})
  const [augList, setAugList] = useState<{ id: string; label: string; category: string }[]>([])
  const [preprocList, setPreprocList] = useState<{ id: string; label: string; category: string }[]>([])
  const [resizeValue, setResizeValue] = useState(640)

  useEffect(() => {
    if (open) {
      getAvailableTransforms().then(({ data }) => {
        setAugList(data.augmentations)
        setPreprocList(data.preprocessing)
      }).catch(() => {})
    }
  }, [open])

  const toggleAug = (id: string) => {
    setSelectedAug((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const togglePreproc = (id: string) => {
    setPreprocessing((prev) => {
      const next = { ...prev }
      if (next[id]) delete next[id]
      else if (id === 'resize') next[id] = resizeValue
      else next[id] = true
      return next
    })
  }

  const handleConfirm = () => {
    onConfirm({
      augmentations: Array.from(selectedAug),
      preprocessing,
    })
  }

  const handleSkip = () => {
    onConfirm({ augmentations: [], preprocessing: {} })
  }

  const imgLevelAugs = augList.filter(a => a.category === 'image')
  const bboxLevelAugs = augList.filter(a => a.category === 'bbox')

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutoFixHighIcon color="primary" />
          {title}
        </Box>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent sx={{ pb: 1 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          選擇預處理和增強選項，這些操作會在匯出/訓練時應用到數據集。每個啟用的增強將為每張圖片生成一個新的增強副本。
        </Alert>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label={`增強 (Augmentation)${selectedAug.size > 0 ? ` · ${selectedAug.size}` : ''}`} />
          <Tab label={`預處理 (Preprocessing)${Object.keys(preprocessing).length > 0 ? ` · ${Object.keys(preprocessing).length}` : ''}`} />
        </Tabs>

        {tab === 0 && (
          <Box>
            {imgLevelAugs.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, color: 'text.secondary' }}>
                  Image Level Augmentations
                </Typography>
                <Grid container spacing={1.5} sx={{ mb: 3 }}>
                  {imgLevelAugs.map((a) => (
                    <Grid item xs={4} sm={3} md={2.4} key={a.id}>
                      <Card
                        variant="outlined"
                        sx={{
                          border: selectedAug.has(a.id) ? 2 : 1,
                          borderColor: selectedAug.has(a.id) ? 'primary.main' : 'divider',
                          bgcolor: selectedAug.has(a.id) ? 'primary.50' : 'background.paper',
                          transition: 'all 0.15s ease',
                          '&:hover': { borderColor: 'primary.light', boxShadow: 2 },
                        }}
                      >
                        <CardActionArea onClick={() => toggleAug(a.id)} sx={{ textAlign: 'center', py: 1.5, px: 0.5 }}>
                          <Box sx={{
                            width: 48, height: 48, borderRadius: 2, mx: 'auto', mb: 0.5,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            bgcolor: selectedAug.has(a.id) ? 'primary.main' : 'action.hover',
                            color: selectedAug.has(a.id) ? 'common.white' : 'text.secondary',
                            transition: 'all 0.15s ease',
                          }}>
                            {AUGMENT_ICONS[a.id] || <AutoFixHighIcon />}
                          </Box>
                          <Typography variant="caption" sx={{ fontWeight: selectedAug.has(a.id) ? 700 : 400, lineHeight: 1.2, display: 'block' }}>
                            {a.label}
                          </Typography>
                        </CardActionArea>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </>
            )}

            {bboxLevelAugs.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, color: 'text.secondary' }}>
                  Bounding Box Level Augmentations
                </Typography>
                <Grid container spacing={1.5}>
                  {bboxLevelAugs.map((a) => (
                    <Grid item xs={4} sm={3} md={2.4} key={a.id}>
                      <Card
                        variant="outlined"
                        sx={{
                          border: selectedAug.has(a.id) ? 2 : 1,
                          borderColor: selectedAug.has(a.id) ? 'primary.main' : 'divider',
                          bgcolor: selectedAug.has(a.id) ? 'primary.50' : 'background.paper',
                          transition: 'all 0.15s ease',
                          '&:hover': { borderColor: 'primary.light', boxShadow: 2 },
                        }}
                      >
                        <CardActionArea onClick={() => toggleAug(a.id)} sx={{ textAlign: 'center', py: 1.5, px: 0.5 }}>
                          <Box sx={{
                            width: 48, height: 48, borderRadius: 2, mx: 'auto', mb: 0.5,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            bgcolor: selectedAug.has(a.id) ? 'primary.main' : 'action.hover',
                            color: selectedAug.has(a.id) ? 'common.white' : 'text.secondary',
                            transition: 'all 0.15s ease',
                          }}>
                            {AUGMENT_ICONS[a.id] || <AutoFixHighIcon />}
                          </Box>
                          <Typography variant="caption" sx={{ fontWeight: selectedAug.has(a.id) ? 700 : 400, lineHeight: 1.2, display: 'block' }}>
                            {a.label}
                          </Typography>
                        </CardActionArea>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </>
            )}

            {selectedAug.size > 0 && (
              <Box sx={{ mt: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  已選擇 <strong>{selectedAug.size}</strong> 個增強。每張圖片將產生 <strong>{selectedAug.size}</strong> 個增強副本。
                </Typography>
                <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {Array.from(selectedAug).map((id) => {
                    const a = augList.find(x => x.id === id)
                    return (
                      <Chip
                        key={id}
                        label={a?.label || id}
                        size="small"
                        color="primary"
                        onDelete={() => toggleAug(id)}
                      />
                    )
                  })}
                </Box>
              </Box>
            )}
          </Box>
        )}

        {tab === 1 && (
          <Box>
            <Grid container spacing={1.5}>
              {preprocList.map((p) => (
                <Grid item xs={6} sm={4} md={3} key={p.id}>
                  <Card
                    variant="outlined"
                    sx={{
                      border: preprocessing[p.id] ? 2 : 1,
                      borderColor: preprocessing[p.id] ? 'secondary.main' : 'divider',
                      bgcolor: preprocessing[p.id] ? 'secondary.50' : 'background.paper',
                      transition: 'all 0.15s ease',
                      '&:hover': { borderColor: 'secondary.light', boxShadow: 2 },
                    }}
                  >
                    <CardActionArea onClick={() => togglePreproc(p.id)} sx={{ textAlign: 'center', py: 2, px: 1 }}>
                      <Box sx={{
                        width: 48, height: 48, borderRadius: 2, mx: 'auto', mb: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        bgcolor: preprocessing[p.id] ? 'secondary.main' : 'action.hover',
                        color: preprocessing[p.id] ? 'common.white' : 'text.secondary',
                        transition: 'all 0.15s ease',
                      }}>
                        {PREPROCESS_ICONS[p.id] || <AutoFixHighIcon />}
                      </Box>
                      <Typography variant="caption" sx={{ fontWeight: preprocessing[p.id] ? 700 : 400, display: 'block' }}>
                        {p.label}
                      </Typography>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>

            {preprocessing.resize !== undefined && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <TextField
                  label="目標尺寸 (長邊像素)"
                  type="number"
                  size="small"
                  value={resizeValue}
                  onChange={(e) => {
                    const v = +e.target.value
                    setResizeValue(v)
                    setPreprocessing((prev) => ({ ...prev, resize: v }))
                  }}
                  sx={{ width: 200 }}
                  helperText="將圖片長邊縮放至此尺寸"
                />
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <Divider />
      <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
        <Button onClick={handleSkip} color="inherit" variant="text">
          跳過（不使用增強）
        </Button>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onClose} color="inherit">取消</Button>
          <Button
            onClick={handleConfirm}
            variant="contained"
            color="primary"
          >
            {confirmLabel}
            {selectedAug.size > 0 && ` (${selectedAug.size} 增強)`}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  )
}
