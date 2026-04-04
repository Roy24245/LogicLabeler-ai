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
  bgColor: string
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
    { title: '數據集', value: datasets.length, icon: <StorageRoundedIcon />, color: theme.palette.primary.main, bgColor: alpha(theme.palette.primary.main, 0.12) },
    { title: '圖片總數', value: totalImages, icon: <ImageRoundedIcon />, color: theme.palette.info.main, bgColor: alpha(theme.palette.info.main, 0.12) },
    { title: '標註總數', value: totalAnnotations, icon: <LabelRoundedIcon />, color: theme.palette.success.main, bgColor: alpha(theme.palette.success.main, 0.12) },
    { title: '訓練任務', value: trainingJobs.length, icon: <ModelTrainingRoundedIcon />, color: theme.palette.warning.main, bgColor: alpha(theme.palette.warning.main, 0.12) },
  ]

  if (loading) return <LinearProgress sx={{ mx: 2, mt: 2 }} />

  return (
    <Box>
      {/* Welcome */}
      <Card
        sx={{
          mb: 3, p: 3,
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.15)} 0%, ${alpha(theme.palette.secondary.main, 0.08)} 100%)`,
          border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h4" sx={{ mb: 0.5 }}>
              歡迎使用 LogicLabeler
            </Typography>
            <Typography variant="body1" color="text.secondary">
              MLLM 語義推理 + 多智能體協作的下一代自動標註系統
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate('/datasets')} sx={{ borderRadius: 3 }}>
              新建數據集
            </Button>
            <Button variant="outlined" startIcon={<RocketLaunchRoundedIcon />} onClick={() => navigate('/training')} sx={{ borderRadius: 3 }}>
              開始訓練
            </Button>
          </Box>
        </Box>
      </Card>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {stats.map((s) => (
          <Grid item xs={6} md={3} key={s.title}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2.5 }}>
                <Avatar sx={{ bgcolor: s.bgColor, color: s.color, width: 48, height: 48 }}>
                  {s.icon}
                </Avatar>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
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

      {/* Lists */}
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6">最近數據集</Typography>
                <Button size="small" endIcon={<ArrowForwardRoundedIcon />} onClick={() => navigate('/datasets')}>
                  查看全部
                </Button>
              </Box>
              <Divider sx={{ mb: 1 }} />
              <List dense disablePadding>
                {datasets.slice(0, 5).map((ds) => (
                  <ListItemButton key={ds.id} onClick={() => navigate(`/datasets/${ds.id}`)} sx={{ borderRadius: 2 }}>
                    <ListItemIcon>
                      <Avatar sx={{ bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main', width: 36, height: 36 }}>
                        <StorageRoundedIcon fontSize="small" />
                      </Avatar>
                    </ListItemIcon>
                    <ListItemText
                      primary={ds.name}
                      secondary={`${ds.image_count} 圖片 / ${ds.annotation_count} 標註`}
                      primaryTypographyProps={{ fontWeight: 500, fontSize: 14 }}
                      secondaryTypographyProps={{ fontSize: 12 }}
                    />
                    <Chip label={ds.task_type} size="small" variant="outlined" sx={{ fontSize: 11 }} />
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
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6">最近訓練任務</Typography>
                <Button size="small" endIcon={<ArrowForwardRoundedIcon />} onClick={() => navigate('/training')}>
                  查看全部
                </Button>
              </Box>
              <Divider sx={{ mb: 1 }} />
              <List dense disablePadding>
                {trainingJobs.slice(0, 5).map((j) => (
                  <ListItemButton key={j.id} onClick={() => navigate('/training')} sx={{ borderRadius: 2 }}>
                    <ListItemIcon>
                      <Avatar sx={{ bgcolor: alpha(theme.palette.warning.main, 0.12), color: 'warning.main', width: 36, height: 36 }}>
                        <ModelTrainingRoundedIcon fontSize="small" />
                      </Avatar>
                    </ListItemIcon>
                    <ListItemText
                      primary={`${j.model_type} — 數據集 #${j.dataset_id}`}
                      secondary={`${j.epochs} epochs / batch ${j.batch_size}`}
                      primaryTypographyProps={{ fontWeight: 500, fontSize: 14 }}
                      secondaryTypographyProps={{ fontSize: 12 }}
                    />
                    <Chip
                      label={j.status}
                      size="small"
                      color={j.status === 'completed' ? 'success' : j.status === 'running' ? 'primary' : 'default'}
                      sx={{ fontSize: 11 }}
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
