import { useEffect, useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Box, Typography, Grid, Card, CardActionArea,
  Divider, Chip, Alert, TextField, Tabs, Tab, IconButton,
  useTheme, alpha,
} from '@mui/material'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import CropRoundedIcon from '@mui/icons-material/CropRounded'
import RotateRightRoundedIcon from '@mui/icons-material/RotateRightRounded'
import Rotate90DegreesCwRoundedIcon from '@mui/icons-material/Rotate90DegreesCwRounded'
import FlipRoundedIcon from '@mui/icons-material/FlipRounded'
import BrightnessHighRoundedIcon from '@mui/icons-material/BrightnessHighRounded'
import ExposureRoundedIcon from '@mui/icons-material/ExposureRounded'
import BlurOnRoundedIcon from '@mui/icons-material/BlurOnRounded'
import GrainRoundedIcon from '@mui/icons-material/GrainRounded'
import BlurLinearRoundedIcon from '@mui/icons-material/BlurLinearRounded'
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded'
import GridOnRoundedIcon from '@mui/icons-material/GridOnRounded'
import InvertColorsRoundedIcon from '@mui/icons-material/InvertColorsRounded'
import ContrastRoundedIcon from '@mui/icons-material/ContrastRounded'
import ViewModuleRoundedIcon from '@mui/icons-material/ViewModuleRounded'
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded'
import FilterBAndWRoundedIcon from '@mui/icons-material/FilterBAndWRounded'
import BlockRoundedIcon from '@mui/icons-material/BlockRounded'
import PhotoSizeSelectLargeRoundedIcon from '@mui/icons-material/PhotoSizeSelectLargeRounded'
import { getAvailableTransforms } from '../api/client'

const AUGMENT_ICONS: Record<string, React.ReactElement> = {
  flip_horizontal: <FlipRoundedIcon />,
  flip_vertical: <FlipRoundedIcon sx={{ transform: 'rotate(90deg)' }} />,
  rotate_90: <Rotate90DegreesCwRoundedIcon />,
  rotation: <RotateRightRoundedIcon />,
  crop: <CropRoundedIcon />,
  shear: <ViewModuleRoundedIcon />,
  brightness: <BrightnessHighRoundedIcon />,
  exposure: <ExposureRoundedIcon />,
  blur: <BlurOnRoundedIcon />,
  noise: <GrainRoundedIcon />,
  motion_blur: <BlurLinearRoundedIcon />,
  cutout: <VisibilityOffRoundedIcon />,
  mosaic: <GridOnRoundedIcon />,
  grayscale: <InvertColorsRoundedIcon />,
  auto_contrast: <ContrastRoundedIcon />,
}

const PREPROCESS_ICONS: Record<string, React.ReactElement> = {
  auto_orient: <AutoFixHighRoundedIcon />,
  resize: <PhotoSizeSelectLargeRoundedIcon />,
  tile: <ViewModuleRoundedIcon />,
  grayscale: <FilterBAndWRoundedIcon />,
  auto_contrast: <ContrastRoundedIcon />,
  filter_null: <BlockRoundedIcon />,
}

interface PreprocessDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (config: { augmentations: string[]; preprocessing: Record<string, any> }) => void
  title?: string
  confirmLabel?: string
}

export default function PreprocessDialog({ open, onClose, onConfirm, title = '預處理與增強配置', confirmLabel = '確認' }: PreprocessDialogProps) {
  const theme = useTheme()
  const [tab, setTab] = useState(0)
  const [selectedAug, setSelectedAug] = useState<Set<string>>(new Set())
  const [preprocessing, setPreprocessing] = useState<Record<string, any>>({})
  const [augList, setAugList] = useState<{ id: string; label: string; category: string }[]>([])
  const [preprocList, setPreprocList] = useState<{ id: string; label: string; category: string }[]>([])
  const [resizeValue, setResizeValue] = useState(640)

  useEffect(() => {
    if (open) { getAvailableTransforms().then(({ data }) => { setAugList(data.augmentations); setPreprocList(data.preprocessing) }).catch(() => {}) }
  }, [open])

  const toggleAug = (id: string) => setSelectedAug((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const togglePreproc = (id: string) => setPreprocessing((prev) => { const next = { ...prev }; if (next[id]) delete next[id]; else if (id === 'resize') next[id] = resizeValue; else next[id] = true; return next })
  const handleConfirm = () => onConfirm({ augmentations: Array.from(selectedAug), preprocessing })
  const handleSkip = () => onConfirm({ augmentations: [], preprocessing: {} })

  const imgLevelAugs = augList.filter(a => a.category === 'image')
  const bboxLevelAugs = augList.filter(a => a.category === 'bbox')

  const renderAugCard = (a: { id: string; label: string }) => {
    const sel = selectedAug.has(a.id)
    return (
      <Grid item xs={4} sm={3} md={2.4} key={a.id}>
        <Card variant="outlined" sx={{
          border: sel ? `2px solid ${theme.palette.primary.main}` : `1px solid ${theme.palette.divider}`,
          bgcolor: sel ? alpha(theme.palette.primary.main, 0.08) : 'background.paper',
          transition: 'all 0.15s', borderRadius: 3,
          '&:hover': { borderColor: theme.palette.primary.light, boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.12)}` },
        }}>
          <CardActionArea onClick={() => toggleAug(a.id)} sx={{ textAlign: 'center', py: 1.5, px: 0.5 }}>
            <Box sx={{
              width: 44, height: 44, borderRadius: 3, mx: 'auto', mb: 0.5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: sel ? 'primary.main' : alpha(theme.palette.text.primary, 0.06),
              color: sel ? 'primary.contrastText' : 'text.secondary', transition: 'all 0.15s',
            }}>
              {AUGMENT_ICONS[a.id] || <AutoFixHighRoundedIcon />}
            </Box>
            <Typography variant="caption" sx={{ fontWeight: sel ? 600 : 400, lineHeight: 1.2, display: 'block', fontSize: 11 }}>{a.label}</Typography>
          </CardActionArea>
        </Card>
      </Grid>
    )
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutoFixHighRoundedIcon color="primary" />
          {title}
        </Box>
        <IconButton onClick={onClose} size="small"><CloseRoundedIcon /></IconButton>
      </DialogTitle>

      <DialogContent sx={{ pb: 1 }}>
        <Alert severity="info" sx={{ mb: 2, borderRadius: 3 }}>
          選擇預處理和增強選項，這些操作會在匯出/訓練時應用。每個啟用的增強將為每張圖片生成一個新副本。
        </Alert>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{
          mb: 2, '& .MuiTab-root': { borderRadius: 3, mx: 0.5 },
          '& .Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.08) },
        }}>
          <Tab label={`增強${selectedAug.size > 0 ? ` · ${selectedAug.size}` : ''}`} />
          <Tab label={`預處理${Object.keys(preprocessing).length > 0 ? ` · ${Object.keys(preprocessing).length}` : ''}`} />
        </Tabs>

        {tab === 0 && (
          <Box>
            {imgLevelAugs.length > 0 && (
              <>
                <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'text.secondary', mb: 1, display: 'block' }}>Image Level</Typography>
                <Grid container spacing={1} sx={{ mb: 2 }}>{imgLevelAugs.map(renderAugCard)}</Grid>
              </>
            )}
            {bboxLevelAugs.length > 0 && (
              <>
                <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'text.secondary', mb: 1, display: 'block' }}>Bounding Box Level</Typography>
                <Grid container spacing={1}>{bboxLevelAugs.map(renderAugCard)}</Grid>
              </>
            )}
            {selectedAug.size > 0 && (
              <Box sx={{ mt: 2, p: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.06), borderRadius: 3 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  已選 <strong>{selectedAug.size}</strong> 個增強
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {Array.from(selectedAug).map((id) => {
                    const a = augList.find(x => x.id === id)
                    return <Chip key={id} label={a?.label || id} size="small" color="primary" onDelete={() => toggleAug(id)} />
                  })}
                </Box>
              </Box>
            )}
          </Box>
        )}

        {tab === 1 && (
          <Box>
            <Grid container spacing={1}>
              {preprocList.map((p) => {
                const sel = !!preprocessing[p.id]
                return (
                  <Grid item xs={6} sm={4} md={3} key={p.id}>
                    <Card variant="outlined" sx={{
                      border: sel ? `2px solid ${theme.palette.secondary.main}` : `1px solid ${theme.palette.divider}`,
                      bgcolor: sel ? alpha(theme.palette.secondary.main, 0.08) : 'background.paper',
                      transition: 'all 0.15s', borderRadius: 3,
                    }}>
                      <CardActionArea onClick={() => togglePreproc(p.id)} sx={{ textAlign: 'center', py: 2, px: 1 }}>
                        <Box sx={{
                          width: 44, height: 44, borderRadius: 3, mx: 'auto', mb: 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          bgcolor: sel ? 'secondary.main' : alpha(theme.palette.text.primary, 0.06),
                          color: sel ? 'secondary.contrastText' : 'text.secondary', transition: 'all 0.15s',
                        }}>
                          {PREPROCESS_ICONS[p.id] || <AutoFixHighRoundedIcon />}
                        </Box>
                        <Typography variant="caption" sx={{ fontWeight: sel ? 600 : 400, display: 'block' }}>{p.label}</Typography>
                      </CardActionArea>
                    </Card>
                  </Grid>
                )
              })}
            </Grid>
            {preprocessing.resize !== undefined && (
              <Box sx={{ mt: 2, p: 2, bgcolor: alpha(theme.palette.secondary.main, 0.06), borderRadius: 3 }}>
                <TextField label="目標尺寸 (長邊像素)" type="number" size="small" value={resizeValue}
                  onChange={(e) => { const v = +e.target.value; setResizeValue(v); setPreprocessing((prev) => ({ ...prev, resize: v })) }}
                  sx={{ width: 200 }} helperText="將圖片長邊縮放至此尺寸" />
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <Divider />
      <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
        <Button onClick={handleSkip} color="inherit">跳過（不使用增強）</Button>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onClose}>取消</Button>
          <Button onClick={handleConfirm} variant="contained" sx={{ borderRadius: 3 }}>
            {confirmLabel}{selectedAug.size > 0 && ` (${selectedAug.size})`}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  )
}
