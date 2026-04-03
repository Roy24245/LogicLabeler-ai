import { useState } from 'react'
import {
  Box, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, List, ListItem, ListItemText, TextField, Tooltip, Typography,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import MergeIcon from '@mui/icons-material/CallMerge'
import AddIcon from '@mui/icons-material/Add'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Cell } from 'recharts'
import {
  renameClass, mergeClasses, deleteClass, updateDataset,
  type Dataset, type DatasetStats,
} from '../api/client'

const PALETTE = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD',
  '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9', '#F0B27A', '#82E0AA',
  '#D7BDE2', '#F1948A', '#7FB3D8', '#73C6B6',
]

interface Props {
  dataset: Dataset
  stats: DatasetStats | null
  onRefresh: () => void
}

export default function ClassManager({ dataset, stats, onRefresh }: Props) {
  const [addOpen, setAddOpen] = useState(false)
  const [newClassName, setNewClassName] = useState('')
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeSource, setMergeSource] = useState('')
  const [mergeTarget, setMergeTarget] = useState('')

  const classes = dataset.label_classes || []
  const dist = stats?.class_distribution || {}

  const chartData = classes.map((cls, i) => ({
    name: cls,
    count: dist[cls] || 0,
    color: PALETTE[i % PALETTE.length],
  }))

  const handleAddClass = async () => {
    if (!newClassName.trim() || classes.includes(newClassName.trim())) return
    try {
      await updateDataset(dataset.id, { label_classes: [...classes, newClassName.trim()] })
      setNewClassName('')
      setAddOpen(false)
      onRefresh()
    } catch { /* empty */ }
  }

  const handleRename = async () => {
    if (!renameValue.trim() || renameValue === renameTarget) return
    try {
      await renameClass(dataset.id, renameTarget, renameValue.trim())
      setRenameOpen(false)
      onRefresh()
    } catch { /* empty */ }
  }

  const handleMerge = async () => {
    if (!mergeSource || !mergeTarget || mergeSource === mergeTarget) return
    try {
      await mergeClasses(dataset.id, mergeSource, mergeTarget)
      setMergeOpen(false)
      onRefresh()
    } catch { /* empty */ }
  }

  const handleDelete = async (cls: string) => {
    if (!confirm(`確定刪除類別 "${cls}" 及其所有標註嗎？`)) return
    try {
      await deleteClass(dataset.id, cls)
      onRefresh()
    } catch { /* empty */ }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">類別管理</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" startIcon={<MergeIcon />} onClick={() => setMergeOpen(true)} disabled={classes.length < 2}>
            合併
          </Button>
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
            新增類別
          </Button>
        </Box>
      </Box>

      <List dense>
        {classes.map((cls, i) => (
          <ListItem
            key={cls}
            secondaryAction={
              <Box>
                <Tooltip title="重命名">
                  <IconButton size="small" onClick={() => { setRenameTarget(cls); setRenameValue(cls); setRenameOpen(true) }}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="刪除">
                  <IconButton size="small" color="error" onClick={() => handleDelete(cls)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            }
          >
            <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: PALETTE[i % PALETTE.length], mr: 1.5, flexShrink: 0 }} />
            <ListItemText
              primary={cls}
              secondary={`${dist[cls] || 0} 個標註`}
            />
          </ListItem>
        ))}
        {classes.length === 0 && (
          <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            尚未定義任何類別
          </Typography>
        )}
      </List>

      {chartData.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" gutterBottom>類別分佈</Typography>
          <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 32)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 12 }} />
              <RTooltip />
              <Bar dataKey="count" name="標註數">
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}

      {/* Add Class Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>新增類別</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth label="類別名稱" sx={{ mt: 1 }}
            value={newClassName} onChange={(e) => setNewClassName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddClass()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleAddClass}>新增</Button>
        </DialogActions>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>重命名類別: {renameTarget}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth label="新名稱" sx={{ mt: 1 }}
            value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleRename}>確認</Button>
        </DialogActions>
      </Dialog>

      {/* Merge Dialog */}
      <Dialog open={mergeOpen} onClose={() => setMergeOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>合併類別</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <Typography variant="body2" color="text.secondary">
            將來源類別的所有標註合併到目標類別
          </Typography>
          <TextField
            select fullWidth label="來源類別" value={mergeSource}
            onChange={(e) => setMergeSource(e.target.value)}
            SelectProps={{ native: true }}
          >
            <option value="" />
            {classes.filter(c => c !== mergeTarget).map(c => <option key={c} value={c}>{c} ({dist[c] || 0})</option>)}
          </TextField>
          <TextField
            select fullWidth label="目標類別" value={mergeTarget}
            onChange={(e) => setMergeTarget(e.target.value)}
            SelectProps={{ native: true }}
          >
            <option value="" />
            {classes.filter(c => c !== mergeSource).map(c => <option key={c} value={c}>{c} ({dist[c] || 0})</option>)}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMergeOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleMerge} disabled={!mergeSource || !mergeTarget}>合併</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
