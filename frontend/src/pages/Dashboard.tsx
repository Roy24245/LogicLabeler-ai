import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Card, CardContent, Grid, Typography, LinearProgress, List,
  ListItemButton, ListItemIcon, ListItemText, Chip, Divider, Button,
  useTheme, alpha, Avatar,
} from '@mui/material'
import StorageRoundedIcon from '@mui/icons-material/StorageRounded'
import ImageRoundedIcon from '@mui/icons-material/ImageRounded'
import LabelRoundedIcon from '@mui/icons-material/LabelRounded'
import ModelTrainingRoundedIcon from '@mui/icons-material/ModelTrainingRounded'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded'
import { getDatasets, getTrainingJobs, getLabelingJobs, type Dataset, type TrainingJobItem } from '../api/client'

interface StatCard {
  title: string
  value: number | string
  icon: React.ReactNode
  color: string
}

export default function Dashboard() {
  const navigate = useNavigate()
  const theme = useTheme()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [trainingJobs, setTrainingJobs] = useState<TrainingJobItem[]>([])
  const [, setLabelingJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const [ds, tj, lj] = await Promise.all([getDatasets(), getTrainingJobs(), getLabelingJobs()])
        setDatasets(ds.data)
        setTrainingJobs(tj.data)
        setLabelingJobs(lj.data)
      } catch { /* empty */ }
      setLoading(false)
    })()
  }, [])

  const totalImages = datasets.reduce((s, d) => s + d.image_count, 0)
  const totalAnnotations = datasets.reduce((s, d) => s + d.annotation_count, 0)

  const stats: StatCard[] = [
    { title: '數據集', value: datasets.length, icon: <StorageRoundedIcon />, color: theme.palette.primary.main },
    { title: '圖片總數', value: totalImages, icon: <ImageRoundedIcon />, color: theme.palette.info.main },
    { title: '標註總數', value: totalAnnotations, icon: <LabelRoundedIcon />, color: theme.palette.success.main },
    { title: '訓練任務', value: trainingJobs.length, icon: <ModelTrainingRoundedIcon />, color: theme.palette.warning.main },
  ]

  if (loading) return <LinearProgress sx={{ mx: 2, mt: 2 }} />

  return (
    <Box>
      <Card
        sx={{
          mb: 3, p: { xs: 2.5, md: 3.5 },
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.16)} 0%, ${alpha(theme.palette.secondary.main, 0.10)} 100%)`,
          borderColor: alpha(theme.palette.primary.main, 0.20),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, minWidth: 0 }}>
            <Box
              component="img"
              src="/logo.png"
              alt="LogicLabeler"
              sx={{
                width: 64, height: 64, borderRadius: '18px',
                objectFit: 'cover',
                boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.3)}`,
                flexShrink: 0,
              }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h4" sx={{ mb: 0.5 }}>歡迎使用 LogicLabeler</Typography>
              <Typography variant="body2" color="text.secondary">
                MLLM 語義推理 + 多智能體協作的下一代自動標註系統
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate('/datasets')}>
              新建數據集
            </Button>
            <Button variant="outlined" startIcon={<RocketLaunchRoundedIcon />} onClick={() => navigate('/training')}>
              開始訓練
            </Button>
          </Box>
        </Box>
      </Card>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {stats.map((s) => (
          <Grid item xs={6} md={3} key={s.title}>
            <Card sx={{ transition: 'transform .2s', '&:hover': { transform: 'translateY(-2px)' } }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2.5 }}>
                <Avatar variant="rounded" sx={{ bgcolor: alpha(s.color, 0.14), color: s.color, width: 48, height: 48, borderRadius: 3 }}>
                  {s.icon}
                </Avatar>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                    {s.title}
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2, mt: 0.3 }}>
                    {s.value}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Typography variant="h6">最近數據集</Typography>
                <Button size="small" endIcon={<ArrowForwardRoundedIcon />} onClick={() => navigate('/datasets')}>
                  查看全部
                </Button>
              </Box>
              <Divider sx={{ mb: 1 }} />
              <List dense disablePadding>
                {datasets.slice(0, 5).map((ds) => (
                  <ListItemButton key={ds.id} onClick={() => navigate(`/datasets/${ds.id}`)} sx={{ mx: 0 }}>
                    <ListItemIcon>
                      <Avatar variant="rounded" sx={{ bgcolor: alpha(theme.palette.primary.main, 0.14), color: 'primary.main', width: 36, height: 36, borderRadius: 2.5 }}>
                        <StorageRoundedIcon fontSize="small" />
                      </Avatar>
                    </ListItemIcon>
                    <ListItemText
                      primary={ds.name}
                      secondary={`${ds.image_count} 圖片 · ${ds.annotation_count} 標註`}
                      primaryTypographyProps={{ fontWeight: 500, fontSize: 14 }}
                      secondaryTypographyProps={{ fontSize: 12 }}
                    />
                    <Chip label={ds.task_type} size="small" variant="outlined" />
                  </ListItemButton>
                ))}
                {datasets.length === 0 && (
                  <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center', fontSize: 14 }}>
                    尚未創建數據集
                  </Typography>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Typography variant="h6">最近訓練任務</Typography>
                <Button size="small" endIcon={<ArrowForwardRoundedIcon />} onClick={() => navigate('/training')}>
                  查看全部
                </Button>
              </Box>
              <Divider sx={{ mb: 1 }} />
              <List dense disablePadding>
                {trainingJobs.slice(0, 5).map((j) => (
                  <ListItemButton key={j.id} onClick={() => navigate('/training')} sx={{ mx: 0 }}>
                    <ListItemIcon>
                      <Avatar variant="rounded" sx={{ bgcolor: alpha(theme.palette.warning.main, 0.14), color: 'warning.main', width: 36, height: 36, borderRadius: 2.5 }}>
                        <ModelTrainingRoundedIcon fontSize="small" />
                      </Avatar>
                    </ListItemIcon>
                    <ListItemText
                      primary={`${j.model_type} — 數據集 #${j.dataset_id}`}
                      secondary={`${j.epochs} epochs · batch ${j.batch_size}`}
                      primaryTypographyProps={{ fontWeight: 500, fontSize: 14 }}
                      secondaryTypographyProps={{ fontSize: 12 }}
                    />
                    <Chip
                      label={j.status}
                      size="small"
                      color={j.status === 'completed' ? 'success' : j.status === 'running' ? 'primary' : 'default'}
                    />
                  </ListItemButton>
                ))}
                {trainingJobs.length === 0 && (
                  <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center', fontSize: 14 }}>
                    尚未有訓練任務
                  </Typography>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
