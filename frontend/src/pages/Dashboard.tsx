import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Card, CardContent, Grid, Typography, LinearProgress, List,
  ListItemButton, ListItemIcon, ListItemText, Chip, Divider,
} from '@mui/material'
import StorageIcon from '@mui/icons-material/Storage'
import ImageIcon from '@mui/icons-material/Image'
import LabelIcon from '@mui/icons-material/Label'
import ModelTrainingIcon from '@mui/icons-material/ModelTraining'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import { getDatasets, getTrainingJobs, getLabelingJobs, type Dataset, type TrainingJobItem } from '../api/client'

interface StatCard {
  title: string
  value: number | string
  icon: React.ReactNode
  color: string
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [trainingJobs, setTrainingJobs] = useState<TrainingJobItem[]>([])
  const [labelingJobs, setLabelingJobs] = useState<any[]>([])
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
    { title: '數據集', value: datasets.length, icon: <StorageIcon />, color: '#7C4DFF' },
    { title: '圖片總數', value: totalImages, icon: <ImageIcon />, color: '#00E5FF' },
    { title: '標註總數', value: totalAnnotations, icon: <LabelIcon />, color: '#69F0AE' },
    { title: '訓練任務', value: trainingJobs.length, icon: <ModelTrainingIcon />, color: '#FF6E40' },
  ]

  if (loading) return <LinearProgress />

  return (
    <Box>
      <Typography variant="h4" gutterBottom>儀表板</Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {stats.map((s) => (
          <Grid item xs={6} md={3} key={s.title}>
            <Card sx={{
              background: `linear-gradient(135deg, ${s.color}15 0%, ${s.color}05 100%)`,
              borderLeft: `3px solid ${s.color}`,
            }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography variant="body2" color="text.secondary">{s.title}</Typography>
                    <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>{s.value}</Typography>
                  </Box>
                  <Box sx={{ color: s.color, opacity: 0.7 }}>{s.icon}</Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <TrendingUpIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                最近數據集
              </Typography>
              <Divider sx={{ mb: 1 }} />
              <List dense>
                {datasets.slice(0, 5).map((ds) => (
                  <ListItemButton key={ds.id} onClick={() => navigate(`/datasets/${ds.id}`)}>
                    <ListItemIcon><StorageIcon /></ListItemIcon>
                    <ListItemText
                      primary={ds.name}
                      secondary={`${ds.image_count} 圖片 / ${ds.annotation_count} 標註`}
                    />
                    <Chip label={ds.task_type} size="small" variant="outlined" />
                  </ListItemButton>
                ))}
                {datasets.length === 0 && (
                  <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    暫無數據集
                  </Typography>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <ModelTrainingIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                最近訓練任務
              </Typography>
              <Divider sx={{ mb: 1 }} />
              <List dense>
                {trainingJobs.slice(0, 5).map((j) => (
                  <ListItemButton key={j.id} onClick={() => navigate('/training')}>
                    <ListItemIcon><ModelTrainingIcon /></ListItemIcon>
                    <ListItemText
                      primary={`${j.model_type} - 數據集 #${j.dataset_id}`}
                      secondary={`${j.epochs} epochs / batch ${j.batch_size}`}
                    />
                    <Chip
                      label={j.status}
                      size="small"
                      color={j.status === 'completed' ? 'success' : j.status === 'running' ? 'primary' : 'default'}
                    />
                  </ListItemButton>
                ))}
                {trainingJobs.length === 0 && (
                  <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    暫無訓練任務
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
