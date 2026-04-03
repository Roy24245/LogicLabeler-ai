import { Box, Card, CardContent, Grid, Typography } from '@mui/material'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, ScatterChart, Scatter, Legend,
} from 'recharts'
import type { DatasetStats as StatsType } from '../api/client'

const PALETTE = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD',
  '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9', '#F0B27A', '#82E0AA',
]

const SPLIT_COLORS: Record<string, string> = {
  train: '#42A5F5',
  val: '#FFA726',
  test: '#EF5350',
  unassigned: '#BDBDBD',
}

interface Props {
  stats: StatsType
}

export default function DatasetStats({ stats }: Props) {
  const classDist = Object.entries(stats.class_distribution).map(([name, count], i) => ({
    name, count, color: PALETTE[i % PALETTE.length],
  }))

  const coverageData = [
    { name: '已標註', value: stats.labeled_images, color: '#4ECDC4' },
    { name: '未標註', value: stats.unlabeled_images, color: '#E0E0E0' },
  ]

  const sourceData = Object.entries(stats.annotation_sources).map(([name, count], i) => ({
    name: name === 'auto' ? '自動' : name === 'manual' ? '手動' : name === 'imported' ? '導入' : name,
    value: count,
    color: PALETTE[(i + 3) % PALETTE.length],
  }))

  const splitData = Object.entries(stats.split_distribution).map(([name, count]) => ({
    name: name === 'unassigned' ? '未分配' : name,
    value: count,
    color: SPLIT_COLORS[name] || '#999',
  }))

  const sizeData = stats.image_sizes.map((s, i) => ({ w: s.w, h: s.h, idx: i }))

  const annHistogram: Record<number, number> = {}
  for (const n of stats.annotations_per_image) {
    annHistogram[n] = (annHistogram[n] || 0) + 1
  }
  const histData = Object.entries(annHistogram).map(([k, v]) => ({
    bucket: `${k} 標註`,
    count: v,
  })).sort((a, b) => parseInt(a.bucket) - parseInt(b.bucket))

  const total = stats.labeled_images + stats.unlabeled_images

  return (
    <Box>
      {/* Summary cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" color="primary">{total}</Typography>
              <Typography variant="body2" color="text.secondary">圖片總數</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" color="success.main">{stats.total_annotations}</Typography>
              <Typography variant="body2" color="text.secondary">標註總數</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" color="info.main">{classDist.length}</Typography>
              <Typography variant="body2" color="text.secondary">類別數</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" color="warning.main">
                {total > 0 ? ((stats.labeled_images / total) * 100).toFixed(0) : 0}%
              </Typography>
              <Typography variant="body2" color="text.secondary">標註覆蓋率</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Class distribution */}
        {classDist.length > 0 && (
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>類別分佈</Typography>
                <ResponsiveContainer width="100%" height={Math.max(200, classDist.length * 30)}>
                  <BarChart data={classDist} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="標註數">
                      {classDist.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Coverage pie */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>標註覆蓋率</Typography>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={coverageData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                    dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {coverageData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Source pie */}
        {sourceData.length > 0 && (
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>標註來源</Typography>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={sourceData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                      dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {sourceData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Split distribution */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>分割分佈</Typography>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={splitData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                    dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {splitData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Image size scatter */}
        {sizeData.length > 0 && (
          <Grid item xs={12} sm={6}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>圖片尺寸分佈</Typography>
                <ResponsiveContainer width="100%" height={250}>
                  <ScatterChart margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="w" name="寬度" unit="px" />
                    <YAxis type="number" dataKey="h" name="高度" unit="px" />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                    <Scatter data={sizeData} fill="#45B7D1" />
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Annotations per image histogram */}
        {histData.length > 0 && (
          <Grid item xs={12} sm={6}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>每圖標註數分佈</Typography>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={histData} margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bucket" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" name="圖片數" fill="#96CEB4" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Box>
  )
}
