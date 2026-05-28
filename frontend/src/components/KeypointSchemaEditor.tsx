import { useState } from 'react'
import {
  Box, Button, Chip, IconButton, Stack, TextField, Typography, useTheme, alpha,
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import LinkRoundedIcon from '@mui/icons-material/LinkRounded'
import { updateDataset, type Dataset, type KeypointSchema } from '../api/client'

interface Props {
  dataset: Dataset
  onRefresh: () => void
  onSnackbar: (msg: string, sev?: 'success' | 'error' | 'info' | 'warning') => void
}

export default function KeypointSchemaEditor({ dataset, onRefresh, onSnackbar }: Props) {
  const theme = useTheme()
  const initial = dataset.keypoint_schema || { names: [], skeleton: [] }
  const [names, setNames] = useState<string[]>(initial.names || [])
  const [skeleton, setSkeleton] = useState<[number, number][]>(
    (initial.skeleton || []) as [number, number][],
  )
  const [newName, setNewName] = useState('')
  const [edgeA, setEdgeA] = useState<number | ''>('')
  const [edgeB, setEdgeB] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)

  const addName = () => {
    const t = newName.trim()
    if (!t || names.includes(t)) return
    setNames(prev => [...prev, t])
    setNewName('')
  }
  const removeName = (idx: number) => {
    setNames(prev => prev.filter((_, i) => i !== idx))
    setSkeleton(prev => prev
      .filter(([a, b]) => a !== idx && b !== idx)
      .map(([a, b]) => [a > idx ? a - 1 : a, b > idx ? b - 1 : b] as [number, number]),
    )
  }
  const addEdge = () => {
    if (edgeA === '' || edgeB === '' || edgeA === edgeB) return
    const pair: [number, number] = [Number(edgeA), Number(edgeB)]
    if (skeleton.some(([a, b]) => (a === pair[0] && b === pair[1]) || (a === pair[1] && b === pair[0]))) return
    setSkeleton(prev => [...prev, pair])
  }
  const removeEdge = (idx: number) => setSkeleton(prev => prev.filter((_, i) => i !== idx))

  const save = async () => {
    setSaving(true)
    try {
      const payload: KeypointSchema = { names, skeleton }
      await updateDataset(dataset.id, { keypoint_schema: payload })
      onSnackbar('已保存關鍵點 schema', 'success')
      onRefresh()
    } catch {
      onSnackbar('保存失敗', 'error')
    } finally {
      setSaving(false)
    }
  }
  const reset = () => {
    setNames(dataset.keypoint_schema?.names || [])
    setSkeleton((dataset.keypoint_schema?.skeleton || []) as [number, number][])
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Typography variant="h6">關鍵點 Schema</Typography>
        <Stack direction="row" spacing={1}>
          <Button onClick={reset} size="small">重置</Button>
          <Button variant="contained" onClick={save} disabled={saving} size="small">{saving ? '保存中...' : '保存'}</Button>
        </Stack>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        定義姿態 / 結構標註所需的關鍵點名稱，以及視覺化用的骨架連線。
      </Typography>

      <Typography variant="subtitle2" sx={{ mb: 1 }}>關鍵點名稱（{names.length}）</Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <TextField size="small" placeholder="例：nose / left_eye" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addName()} />
        <Button startIcon={<AddRoundedIcon />} variant="tonal" onClick={addName}>新增</Button>
      </Stack>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
        {names.length === 0
          ? <Typography variant="caption" color="text.secondary">尚未定義關鍵點</Typography>
          : names.map((n, i) => (
            <Chip key={n + i} label={`${i + 1}. ${n}`} size="small" onDelete={() => removeName(i)} />
          ))}
      </Box>

      <Typography variant="subtitle2" sx={{ mb: 1 }}>骨架連線（{skeleton.length}）</Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
        <TextField select size="small" SelectProps={{ native: true }} sx={{ minWidth: 120 }}
          value={edgeA} onChange={e => setEdgeA(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">起點</option>
          {names.map((n, i) => <option key={i} value={i}>{i + 1}. {n}</option>)}
        </TextField>
        <TextField select size="small" SelectProps={{ native: true }} sx={{ minWidth: 120 }}
          value={edgeB} onChange={e => setEdgeB(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">終點</option>
          {names.map((n, i) => <option key={i} value={i}>{i + 1}. {n}</option>)}
        </TextField>
        <Button startIcon={<LinkRoundedIcon />} variant="tonal" onClick={addEdge} disabled={edgeA === '' || edgeB === '' || edgeA === edgeB}>連線</Button>
      </Stack>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {skeleton.length === 0
          ? <Typography variant="caption" color="text.secondary">尚未定義骨架</Typography>
          : skeleton.map(([a, b], i) => (
            <Chip
              key={i}
              size="small"
              label={`${names[a] || `?${a}`} → ${names[b] || `?${b}`}`}
              onDelete={() => removeEdge(i)}
              sx={{ bgcolor: alpha(theme.palette.primary.main, 0.1) }}
            />
          ))}
      </Box>
    </Box>
  )
}
