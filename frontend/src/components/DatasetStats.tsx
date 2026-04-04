import { Box, Card, CardContent, Grid, Typography, useTheme, alpha, Avatar } from '@mui/material'
import ImageRoundedIcon from '@mui/icons-material/ImageRounded'
import LabelRoundedIcon from '@mui/icons-material/LabelRounded'
import CategoryRoundedIcon from '@mui/icons-material/CategoryRounded'
import PercentRoundedIcon from '@mui/icons-material/PercentRounded'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, ScatterChart, Scatter,
} from 'recharts'
import type { DatasetStats as StatsType } from '../api/client'

const PALETTE = ['#6750A4', '#0061A4', '#7D5260', '#1B8755', '#E8A317', '#B3261E', '#625B71', '#00677E', '#984061', '#006D2F', '#7E5700', '#4A6741']
const SPLIT_COLORS: Record<string, string> = { train: '#0061A4', val: '#E8A317', test: '#B3261E', unassigned: '#CAC4D0' }

interface Props { stats: StatsType }

export default function DatasetStats({ stats }: Props) {
  const theme = useTheme()
  const classDist = Object.entries(stats.class_distribution).map(([name, count], i) => ({ name, count, color: PALETTE[i % PALETTE.length] }))
  const coverageData = [{ name: '已標註', value: stats.labeled_images, color: theme.palette.success.main }, { name: '未標註', value: stats.unlabeled_images, color: theme.palette.divider }]
  const sourceData = Object.entries(stats.annotation_sources).map(([name, count], i) => ({
    name: name === 'auto' ? '自動' : name === 'manual' ? '手動' : name === 'imported' ? '導入' : name,
    value: count, color: PALETTE[(i + 3) % PALETTE.length],
  }))
  const splitData = Object.entries(stats.split_distribution).map(([name, count]) => ({
    name: name === 'unassigned' ? '未分配' : name, value: count, color: SPLIT_COLORS[name] || '#999',
  }))
  const sizeData = stats.image_sizes.map((s, i) => ({ w: s.w, h: s.h, idx: i }))
  const annHistogram: Record<number, number> = {}
  for (const n of stats.annotations_per_image) annHistogram[n] = (annHistogram[n] || 0) + 1
  const histData = Object.entries(annHistogram).map(([k, v]) => ({ bucket: `${k}`, count: v })).sort((a, b) => parseInt(a.bucket) - parseInt(b.bucket))
  const total = stats.labeled_images + stats.unlabeled_images

  const statCards = [
    { label: '圖片總數', value: total, icon: <ImageRoundedIcon />, color: theme.palette.primary.main },
    { label: '標註總數', value: stats.total_annotations, icon: <LabelRoundedIcon />, color: theme.palette.success.main },
    { label: '類別數', value: classDist.length, icon: <CategoryRoundedIcon />, color: theme.palette.info.main },
    { label: '覆蓋率', value: `${total > 0 ? ((stats.labeled_images / total) * 100).toFixed(0) : 0}%`, icon: <PercentRoundedIcon />, color: theme.palette.warning.main },
  ]

  const chartStyle = { backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 12 }

  return (
    <Box>
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {statCards.map((s) => (
          <Grid item xs={6} sm={3} key={s.label}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
                <Avatar sx={{ bgcolor: alpha(s.color, 0.12), color: s.color, width: 40, height: 40 }}>{s.icon}</Avatar>
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{s.value}</Typography>
                  <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        {classDist.length > 0 && (
          <Grid item xs={12} md={6}>
            <Card><CardContent>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>類別分佈</Typography>
              <ResponsiveContainer width="100%" height={Math.max(200, classDist.length * 30)}>
                <BarChart data={classDist} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.08)} />
                  <XAxis type="number" stroke={theme.palette.text.secondary} />
                  <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 12, fill: theme.palette.text.secondary }} />
                  <Tooltip contentStyle={chartStyle} />
                  <Bar dataKey="count" name="標註數" radius={[0, 4, 4, 0]}>{classDist.map((e, i) => <Cell key={i} fill={e.color} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent></Card>
          </Grid>
        )}

        <Grid item xs={12} sm={6} md={3}>
          <Card><CardContent>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>標註覆蓋率</Typography>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={coverageData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" nameKey="name"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {coverageData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={chartStyle} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent></Card>
        </Grid>

        {sourceData.length > 0 && (
          <Grid item xs={12} sm={6} md={3}>
            <Card><CardContent>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>標註來源</Typography>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={sourceData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {sourceData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={chartStyle} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent></Card>
          </Grid>
        )}

        <Grid item xs={12} sm={6} md={3}>
          <Card><CardContent>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>分割分佈</Typography>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={splitData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" nameKey="name"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {splitData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={chartStyle} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent></Card>
        </Grid>

        {sizeData.length > 0 && (
          <Grid item xs={12} sm={6}>
            <Card><CardContent>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>圖片尺寸分佈</Typography>
              <ResponsiveContainer width="100%" height={250}>
                <ScatterChart margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.08)} />
                  <XAxis type="number" dataKey="w" name="寬度" unit="px" stroke={theme.palette.text.secondary} />
                  <YAxis type="number" dataKey="h" name="高度" unit="px" stroke={theme.palette.text.secondary} />
                  <Tooltip contentStyle={chartStyle} cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter data={sizeData} fill={theme.palette.primary.main} />
                </ScatterChart>
              </ResponsiveContainer>
            </CardContent></Card>
          </Grid>
        )}

        {histData.length > 0 && (
          <Grid item xs={12} sm={6}>
            <Card><CardContent>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>每圖標註數分佈</Typography>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={histData} margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.08)} />
                  <XAxis dataKey="bucket" stroke={theme.palette.text.secondary} />
                  <YAxis stroke={theme.palette.text.secondary} />
                  <Tooltip contentStyle={chartStyle} />
                  <Bar dataKey="count" name="圖片數" fill={theme.palette.success.main} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent></Card>
          </Grid>
        )}
      </Grid>
    </Box>
  )
}
