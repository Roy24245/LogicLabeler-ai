import { useState } from 'react'
import {
  Box, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, List, ListItem, ListItemText, TextField, Tooltip, Typography,
  useTheme, alpha, Avatar,
} from '@mui/material'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import CallMergeRoundedIcon from '@mui/icons-material/CallMergeRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Cell } from 'recharts'
import {
  renameClass, mergeClasses, deleteClass, updateDataset,
  type Dataset, type DatasetStats,
} from '../api/client'

const PALETTE = ['#6750A4', '#0061A4', '#7D5260', '#1B8755', '#E8A317', '#B3261E', '#625B71', '#00677E', '#984061', '#006D2F', '#7E5700', '#4A6741']

interface Props { dataset: Dataset; stats: DatasetStats | null; onRefresh: () => void }

export default function ClassManager({ dataset, stats, onRefresh }: Props) {
  const theme = useTheme()
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
  const chartData = classes.map((cls, i) => ({ name: cls, count: dist[cls] || 0, color: PALETTE[i % PALETTE.length] }))

  const handleAddClass = async () => {
    if (!newClassName.trim() || classes.includes(newClassName.trim())) return
    try { await updateDataset(dataset.id, { label_classes: [...classes, newClassName.trim()] }); setNewClassName(''); setAddOpen(false); onRefresh() } catch {}
  }
  const handleRename = async () => {
    if (!renameValue.trim() || renameValue === renameTarget) return
    try { await renameClass(dataset.id, renameTarget, renameValue.trim()); setRenameOpen(false); onRefresh() } catch {}
  }
  const handleMerge = async () => {
    if (!mergeSource || !mergeTarget || mergeSource === mergeTarget) return
    try { await mergeClasses(dataset.id, mergeSource, mergeTarget); setMergeOpen(false); onRefresh() } catch {}
  }
  const handleDelete = async (cls: string) => {
    if (!confirm(`確定刪除類別 "${cls}" 及其所有標註嗎？`)) return
    try { await deleteClass(dataset.id, cls); onRefresh() } catch {}
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">類別管理</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" startIcon={<CallMergeRoundedIcon />} onClick={() => setMergeOpen(true)} disabled={classes.length < 2}>合併</Button>
          <Button size="small" variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setAddOpen(true)} sx={{ borderRadius: 3 }}>新增類別</Button>
        </Box>
      </Box>

      <List dense>
        {classes.map((cls, i) => (
          <ListItem key={cls} secondaryAction={
            <Box>
              <Tooltip title="重命名"><IconButton size="small" onClick={() => { setRenameTarget(cls); setRenameValue(cls); setRenameOpen(true) }}><EditRoundedIcon fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="刪除"><IconButton size="small" color="error" onClick={() => handleDelete(cls)}><DeleteRoundedIcon fontSize="small" /></IconButton></Tooltip>
            </Box>
          } sx={{ borderRadius: 2, '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) } }}>
            <Avatar sx={{ width: 24, height: 24, bgcolor: PALETTE[i % PALETTE.length], mr: 1.5, fontSize: 11, fontWeight: 600 }}>
              {cls.charAt(0).toUpperCase()}
            </Avatar>
            <ListItemText primary={cls} secondary={`${dist[cls] || 0} 個標註`} primaryTypographyProps={{ fontWeight: 500, fontSize: 14 }} />
          </ListItem>
        ))}
        {classes.length === 0 && <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>尚未定義任何類別</Typography>}
      </List>

      {chartData.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" gutterBottom>類別分佈</Typography>
          <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 30)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.08)} />
              <XAxis type="number" stroke={theme.palette.text.secondary} />
              <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 12, fill: theme.palette.text.secondary }} />
              <RTooltip contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 12 }} />
              <Bar dataKey="count" name="標註數" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 600 }}>新增類別</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="類別名稱" sx={{ mt: 1 }} value={newClassName} onChange={(e) => setNewClassName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddClass()} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={() => setAddOpen(false)}>取消</Button><Button variant="contained" onClick={handleAddClass}>新增</Button></DialogActions>
      </Dialog>

      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 600 }}>重命名: {renameTarget}</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="新名稱" sx={{ mt: 1 }} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRename()} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={() => setRenameOpen(false)}>取消</Button><Button variant="contained" onClick={handleRename}>確認</Button></DialogActions>
      </Dialog>

      <Dialog open={mergeOpen} onClose={() => setMergeOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 600 }}>合併類別</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <Typography variant="body2" color="text.secondary">將來源類別的所有標註合併到目標類別</Typography>
          <TextField select fullWidth label="來源類別" value={mergeSource} onChange={(e) => setMergeSource(e.target.value)} SelectProps={{ native: true }}>
            <option value="" />{classes.filter(c => c !== mergeTarget).map(c => <option key={c} value={c}>{c} ({dist[c] || 0})</option>)}
          </TextField>
          <TextField select fullWidth label="目標類別" value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} SelectProps={{ native: true }}>
            <option value="" />{classes.filter(c => c !== mergeSource).map(c => <option key={c} value={c}>{c} ({dist[c] || 0})</option>)}
          </TextField>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={() => setMergeOpen(false)}>取消</Button><Button variant="contained" onClick={handleMerge} disabled={!mergeSource || !mergeTarget}>合併</Button></DialogActions>
      </Dialog>
    </Box>
  )
}
