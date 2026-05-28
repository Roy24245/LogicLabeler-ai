import { useMemo, useState } from 'react'
import {
  Accordion, AccordionDetails, AccordionSummary,
  alpha, Autocomplete, Box, Button, Card, Checkbox, Chip, Divider, FormControlLabel,
  IconButton, MenuItem, Select, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup,
  Tooltip, Typography, useTheme,
} from '@mui/material'
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded'
import LockRoundedIcon from '@mui/icons-material/LockRounded'
import LockOpenRoundedIcon from '@mui/icons-material/LockOpenRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import CancelRoundedIcon from '@mui/icons-material/CancelRounded'
import WarningRoundedIcon from '@mui/icons-material/WarningRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded'
import type { ImageItem } from '../../api/client'
import type { LocalAnn } from './types'

interface Props {
  annotations: LocalAnn[]
  setAnnotations: (next: LocalAnn[] | ((prev: LocalAnn[]) => LocalAnn[]), pushHistory?: boolean) => void
  selectedIdxs: number[]
  setSelectedIdxs: (idxs: number[]) => void
  classColors: Record<string, string>
  allClasses: string[]
  hiddenClasses: Set<string>
  setHiddenClasses: (s: Set<string>) => void
  imageMeta: { verified: boolean; tags: string[]; note: string; split: string | null }
  setImageMeta: (m: { verified: boolean; tags: string[]; note: string; split: string | null }) => void
  imageItem: ImageItem | null
  imageWidth: number
  imageHeight: number
  onClassChange: (idx: number, newClass: string) => void
  onBatchChangeClass: (newClass: string) => void
  onBatchDelete: () => void
  onBatchToggleLock: () => void
}

export default function SidePanel(p: Props) {
  const theme = useTheme()
  const [search, setSearch] = useState('')
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set())
  const [showAttributes, setShowAttributes] = useState(true)

  const classCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const a of p.annotations) m[a.class_name] = (m[a.class_name] || 0) + 1
    return m
  }, [p.annotations])

  const visibleIdxs = useMemo(() => {
    const q = search.trim().toLowerCase()
    return p.annotations
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => {
        if (activeFilters.size && !activeFilters.has(a.class_name)) return false
        if (!q) return true
        return a.class_name.toLowerCase().includes(q) || (a.note || '').toLowerCase().includes(q)
      })
      .map(({ i }) => i)
  }, [p.annotations, search, activeFilters])

  const selected = p.selectedIdxs.length === 1 ? p.annotations[p.selectedIdxs[0]] : null

  const toggleClassFilter = (cls: string) => {
    const next = new Set(activeFilters)
    if (next.has(cls)) next.delete(cls); else next.add(cls)
    setActiveFilters(next)
  }

  const toggleClassVisibility = (cls: string) => {
    const next = new Set(p.hiddenClasses)
    if (next.has(cls)) next.delete(cls); else next.add(cls)
    p.setHiddenClasses(next)
  }

  const updateSelectedField = <K extends keyof LocalAnn>(key: K, value: LocalAnn[K]) => {
    if (selected === null) return
    const idx = p.selectedIdxs[0]
    p.setAnnotations(prev => prev.map((a, i) => i === idx ? { ...a, [key]: value } : a), true)
  }

  const updateSelectedAttr = (key: string, value: any) => {
    if (selected === null) return
    const idx = p.selectedIdxs[0]
    p.setAnnotations(prev => prev.map((a, i) => i === idx ? { ...a, attributes: { ...a.attributes, [key]: value } } : a), true)
  }

  return (
    <Box sx={{ width: 320, borderLeft: `1px solid ${theme.palette.divider}`, overflow: 'auto', p: 1.25, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {/* Image-level metadata */}
      <Card variant="outlined" sx={{ p: 1.25 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1 }}>圖片資訊</Typography>
          <Tooltip title={p.imageMeta.verified ? '已驗證' : '標記為已驗證'}>
            <ToggleButton
              value="verified"
              size="small"
              selected={p.imageMeta.verified}
              onChange={() => p.setImageMeta({ ...p.imageMeta, verified: !p.imageMeta.verified })}
              sx={{ borderRadius: 999, px: 1.25 }}
            >
              <VerifiedRoundedIcon fontSize="small" />
            </ToggleButton>
          </Tooltip>
        </Stack>
        <Typography variant="caption" color="text.secondary">{p.imageItem?.filename} · {p.imageWidth}×{p.imageHeight}</Typography>
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary">分割</Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={p.imageMeta.split || ''}
            onChange={(_, v) => p.setImageMeta({ ...p.imageMeta, split: v || null })}
            sx={{ mt: 0.25, display: 'flex' }}
          >
            <ToggleButton value="train" sx={{ flex: 1 }}>Train</ToggleButton>
            <ToggleButton value="val" sx={{ flex: 1 }}>Val</ToggleButton>
            <ToggleButton value="test" sx={{ flex: 1 }}>Test</ToggleButton>
            <ToggleButton value="" sx={{ flex: 1 }}>—</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Autocomplete
          multiple
          freeSolo
          size="small"
          options={[]}
          value={p.imageMeta.tags}
          onChange={(_, v) => p.setImageMeta({ ...p.imageMeta, tags: v as string[] })}
          renderInput={(params) => <TextField {...params} label="標籤" size="small" />}
          sx={{ mt: 1 }}
        />
        <TextField
          label="備註"
          size="small"
          fullWidth
          multiline
          maxRows={3}
          value={p.imageMeta.note}
          onChange={e => p.setImageMeta({ ...p.imageMeta, note: e.target.value })}
          sx={{ mt: 1 }}
        />
      </Card>

      {/* Class chips with visibility & filter */}
      {Object.keys(classCounts).length > 0 && (
        <Card variant="outlined" sx={{ p: 1.25 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>類別</Typography>
            {activeFilters.size > 0 && (
              <Button size="small" onClick={() => setActiveFilters(new Set())}>清除</Button>
            )}
          </Stack>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {Object.entries(classCounts).map(([cls, count]) => {
              const active = activeFilters.has(cls)
              const hidden = p.hiddenClasses.has(cls)
              const color = p.classColors[cls] || theme.palette.primary.main
              return (
                <Box key={cls} sx={{ display: 'flex', alignItems: 'center' }}>
                  <Chip
                    size="small"
                    label={`${cls} ${count}`}
                    onClick={() => toggleClassFilter(cls)}
                    sx={{
                      bgcolor: active ? alpha(color, 0.4) : alpha(color, 0.15),
                      color: active ? '#fff' : color,
                      fontWeight: 500,
                      borderRadius: 1.5,
                      cursor: 'pointer',
                      mr: 0,
                    }}
                  />
                  <Tooltip title={hidden ? '顯示' : '隱藏'}>
                    <IconButton size="small" onClick={() => toggleClassVisibility(cls)} sx={{ p: 0.25, ml: 0.25 }}>
                      {hidden ? <VisibilityOffRoundedIcon sx={{ fontSize: 16 }} /> : <VisibilityRoundedIcon sx={{ fontSize: 16 }} />}
                    </IconButton>
                  </Tooltip>
                </Box>
              )
            })}
          </Box>
        </Card>
      )}

      {/* Search */}
      <TextField
        size="small"
        placeholder="搜尋類別/備註"
        value={search}
        onChange={e => setSearch(e.target.value)}
        InputProps={{ startAdornment: <SearchRoundedIcon fontSize="small" sx={{ mr: 0.5, color: 'text.secondary' }} /> }}
      />

      {/* Multi-select toolbar */}
      {p.selectedIdxs.length > 1 && (
        <Card variant="outlined" sx={{ p: 1, bgcolor: alpha(theme.palette.primary.main, 0.06) }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Chip label={`已選 ${p.selectedIdxs.length}`} size="small" color="primary" />
            <Tooltip title="批量改類">
              <IconButton size="small" onClick={() => {
                const newClass = window.prompt('改成類別')
                if (newClass) p.onBatchChangeClass(newClass)
              }}><SwapHorizRoundedIcon fontSize="small" /></IconButton>
            </Tooltip>
            <Tooltip title="批量鎖定">
              <IconButton size="small" onClick={p.onBatchToggleLock}><LockRoundedIcon fontSize="small" /></IconButton>
            </Tooltip>
            <Tooltip title="批量刪除">
              <IconButton size="small" color="error" onClick={p.onBatchDelete}><DeleteRoundedIcon fontSize="small" /></IconButton>
            </Tooltip>
            <Box sx={{ flex: 1 }} />
            <Button size="small" onClick={() => p.setSelectedIdxs([])}>取消</Button>
          </Stack>
        </Card>
      )}

      {/* Annotation list */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography variant="caption" color="text.secondary">標註列表 ({visibleIdxs.length}/{p.annotations.length})</Typography>
        {visibleIdxs.map(i => {
          const a = p.annotations[i]
          const sel = p.selectedIdxs.includes(i)
          const color = p.classColors[a.class_name] || theme.palette.primary.main
          return (
            <Card
              key={a.id}
              variant="outlined"
              onClick={(e) => {
                if (e.shiftKey || e.metaKey || e.ctrlKey) {
                  if (sel) p.setSelectedIdxs(p.selectedIdxs.filter(x => x !== i))
                  else p.setSelectedIdxs([...p.selectedIdxs, i])
                } else {
                  p.setSelectedIdxs([i])
                }
              }}
              sx={{
                p: 0.875, cursor: 'pointer',
                borderColor: sel ? theme.palette.primary.main : theme.palette.divider,
                borderWidth: sel ? 2 : 1,
                bgcolor: sel ? alpha(theme.palette.primary.main, 0.06) : 'background.paper',
                transition: 'all 0.12s',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {sel && p.selectedIdxs.length === 1 ? (
                  <Autocomplete
                    freeSolo
                    size="small"
                    sx={{ flex: 1 }}
                    options={p.allClasses}
                    value={a.class_name}
                    onChange={(_, v) => v && p.onClassChange(i, v)}
                    onInputChange={(_, v, reason) => { if (reason === 'input') p.onClassChange(i, v) }}
                    renderInput={(params) => <TextField {...params} size="small" />}
                  />
                ) : (
                  <Chip
                    size="small"
                    label={a.class_name}
                    sx={{ bgcolor: alpha(color, 0.18), color, maxWidth: 150, fontWeight: 500 }}
                  />
                )}
                <Box sx={{ flex: 1 }} />
                {a.review_status === 'approved' && <Tooltip title="AI 通過"><CheckCircleRoundedIcon sx={{ fontSize: 16, color: 'success.main' }} /></Tooltip>}
                {a.review_status === 'rejected' && <Tooltip title={a.review_comment || '拒絕'}><CancelRoundedIcon sx={{ fontSize: 16, color: 'error.main' }} /></Tooltip>}
                {a.review_status === 'needs_adjustment' && <Tooltip title={a.review_comment || '需調整'}><WarningRoundedIcon sx={{ fontSize: 16, color: 'warning.main' }} /></Tooltip>}
                <Tooltip title={a.locked ? '解鎖' : '鎖定'}>
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); p.setAnnotations(prev => prev.map((x, k) => k === i ? { ...x, locked: !x.locked } : x), true) }} sx={{ p: 0.25 }}>
                    {a.locked ? <LockRoundedIcon sx={{ fontSize: 14 }} /> : <LockOpenRoundedIcon sx={{ fontSize: 14 }} />}
                  </IconButton>
                </Tooltip>
                <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); p.setAnnotations(prev => prev.filter((_, k) => k !== i), true); p.setSelectedIdxs([]) }} sx={{ p: 0.25 }}>
                  <DeleteRoundedIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
              <Typography variant="caption" color="text.secondary" fontSize={10}>
                {a.shape_type} · {a.source}{a.confidence ? ` · ${(a.confidence * 100).toFixed(0)}%` : ''}
                {a.bbox ? ` · [${a.bbox.x.toFixed(0)},${a.bbox.y.toFixed(0)},${a.bbox.w.toFixed(0)},${a.bbox.h.toFixed(0)}]` : ''}
              </Typography>
            </Card>
          )
        })}
        {p.annotations.length === 0 && (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4, fontSize: 13 }}>暫無標註 — 按 B 繪製矩形</Typography>
        )}
      </Box>

      {/* Per-annotation detail panel */}
      {selected && (
        <Card variant="outlined" sx={{ p: 1.25 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>標註詳情</Typography>
            <ToggleButton value="more" size="small" selected={showAttributes} onChange={() => setShowAttributes(!showAttributes)} sx={{ p: 0.5 }}>
              <ExpandMoreRoundedIcon fontSize="small" sx={{ transform: showAttributes ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
            </ToggleButton>
          </Stack>

          {selected.shape_type === 'bbox' && selected.bbox && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75, mb: 1 }}>
              {(['x', 'y', 'w', 'h'] as const).map(k => (
                <TextField
                  key={k}
                  label={k.toUpperCase()}
                  size="small"
                  type="number"
                  value={Math.round((selected.bbox as any)[k])}
                  onChange={e => {
                    const v = Number(e.target.value)
                    const idx = p.selectedIdxs[0]
                    p.setAnnotations(prev => prev.map((a, i) => i === idx && a.bbox ? { ...a, bbox: { ...a.bbox, [k]: v } } : a), true)
                  }}
                />
              ))}
            </Box>
          )}

          <Accordion expanded={showAttributes} onChange={(_, ex) => setShowAttributes(ex)} disableGutters sx={{ '&:before': { display: 'none' }, boxShadow: 'none', bgcolor: 'transparent' }}>
            <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ minHeight: 32, p: 0, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>屬性</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <Stack spacing={0.5}>
                <FormControlLabel
                  control={<Switch size="small" checked={!!selected.attributes?.occluded} onChange={e => updateSelectedAttr('occluded', e.target.checked)} />}
                  label={<Typography variant="body2">遮蔽 (occluded)</Typography>}
                />
                <FormControlLabel
                  control={<Switch size="small" checked={!!selected.attributes?.truncated} onChange={e => updateSelectedAttr('truncated', e.target.checked)} />}
                  label={<Typography variant="body2">截斷 (truncated)</Typography>}
                />
                <FormControlLabel
                  control={<Switch size="small" checked={!!selected.attributes?.blur} onChange={e => updateSelectedAttr('blur', e.target.checked)} />}
                  label={<Typography variant="body2">模糊 (blur)</Typography>}
                />
                <TextField
                  label="標註備註"
                  size="small"
                  multiline
                  maxRows={3}
                  value={selected.note || ''}
                  onChange={e => updateSelectedField('note', e.target.value)}
                />
              </Stack>
            </AccordionDetails>
          </Accordion>
        </Card>
      )}
    </Box>
  )
}
