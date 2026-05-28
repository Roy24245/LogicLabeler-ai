import { Box, Chip, Dialog, DialogContent, DialogTitle, Divider, IconButton, Stack, Typography } from '@mui/material'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'

interface Props { open: boolean; onClose: () => void }

const SECTIONS: { title: string; items: [string, string][] }[] = [
  {
    title: '工具切換',
    items: [
      ['V', '檢視'],
      ['B', '繪製矩形'],
      ['G', '繪製多邊形'],
      ['K', '關鍵點'],
      ['O', '旋轉框'],
      ['M', '智能分割（點擊自動產生 polygon）'],
      ['E', '編輯'],
    ],
  },
  {
    title: '繪製操作',
    items: [
      ['Shift（拖曳時）', '等比例'],
      ['Esc', '取消當前繪製'],
      ['Enter / 雙擊起點', '完成多邊形'],
      ['Backspace', '刪除最後一個多邊形頂點'],
      ['右鍵（頂點上）', '刪除頂點'],
      ['左鍵（邊上）', '插入頂點'],
    ],
  },
  {
    title: '選取與編輯',
    items: [
      ['滑鼠左鍵', '選擇標註'],
      ['Shift / Ctrl + 點擊', '多選'],
      ['方向鍵', '微調 1px'],
      ['Shift + 方向鍵', '微調 10px'],
      ['Delete / Backspace', '刪除選中標註'],
      ['Ctrl/⌘ + C / V', '複製 / 貼上'],
      ['Ctrl/⌘ + Z / Shift+Z', '撤銷 / 重做'],
      ['Ctrl/⌘ + S', '保存'],
      ['Ctrl/⌘ + 0', '回到全圖檢視'],
      ['Alt + 拖曳 / 中鍵', '平移畫布'],
      ['滾輪', '縮放'],
    ],
  },
  {
    title: '圖片切換 / 類別',
    items: [
      ['N / →', '下一張'],
      ['P / ←', '上一張'],
      ['1 ~ 9', '切換目前繪製類別'],
      ['L', '鎖定 / 解鎖選中標註'],
      ['T / Y / U', '指定為 Train / Val / Test'],
    ],
  },
]

export default function ShortcutsDialog({ open, onClose }: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        鍵盤快捷鍵
        <Box sx={{ flex: 1 }} />
        <IconButton onClick={onClose} size="small"><CloseRoundedIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
          {SECTIONS.map(sec => (
            <Box key={sec.title}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>{sec.title}</Typography>
              <Divider sx={{ mb: 1 }} />
              <Stack spacing={0.75}>
                {sec.items.map(([key, desc]) => (
                  <Stack key={key} direction="row" spacing={1.5} alignItems="center">
                    <Chip size="small" label={key} sx={{ fontFamily: 'monospace', minWidth: 90, justifyContent: 'center' }} />
                    <Typography variant="body2">{desc}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  )
}
