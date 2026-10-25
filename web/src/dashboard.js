// 课程旋律图（首页签名元素）：
// 课程是一条沿五线谱上行的旋律，每个章节是一个音符，用各自的唱名色；
// 加载时音符沿谱线依次"奏出"（一次性编排动画），点击进入章节。

export const CHAPTERS = [
  { id: 'ch1', href: '#/chapter/1', label: '第一章', title: '声音与音名', colorVar: '--do' },
  { id: 'ch2', href: '#/chapter/2', label: '第二章', title: '节奏与节拍', colorVar: '--re' },
  { id: 'ch3', href: '#/chapter/3', label: '第三章', title: '音阶', colorVar: '--mi' },
  { id: 'ch4', href: '#/chapter/4', label: '第四章', title: '音程', colorVar: '--fa' },
  { id: 'ch5', href: '#/chapter/5', label: '第五章', title: '和弦', colorVar: '--sol' },
  { id: 'ch6', href: '#/chapter/6', label: '第六章', title: '和声进行', colorVar: '--la' },
  { id: 'ear', href: '#/ear', label: '训练场', title: '练耳训练场', colorVar: '--si' },
]

/**
 * 渲染课程旋律图。progress: { [chapterId]: 'unstarted'|'active'|'done' }
 */
export function buildMelodyMap(container, progress = {}) {
  const W = 1080
  const H = 320
  const staffTop = 84
  const lineGap = 16
  const notesTop = 150 // 第一个音符的谱面位置（自下而上）
  const stepY = 15 // 每章上行一个"音级"
  const startX = 110
  const gapX = 145

  let svg = `<svg class="melody-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="课程旋律图：七个章节沿五线谱上行">`

  // 五线谱
  for (let i = 0; i < 5; i++) {
    const y = staffTop + i * lineGap
    svg += `<line x1="36" y1="${y}" x2="${W - 36}" y2="${y}" class="staff-line" />`
  }
  // 起始小节线与谱号占位（用高音谱号字符，字体不支持时优雅退化）
  svg += `<line x1="36" y1="${staffTop}" x2="36" y2="${staffTop + lineGap * 4}" class="staff-bar" />`
  svg += `<text x="46" y="${staffTop + lineGap * 3 + 4}" class="clef">𝄞</text>`

  CHAPTERS.forEach((ch, i) => {
    const x = startX + i * gapX
    const cy = notesTop - i * stepY
    const state = progress[ch.id] || 'unstarted'
    const middleLine = staffTop + lineGap * 2
    const stemUp = cy > middleLine
    const stem = stemUp
      ? `<line x1="${x + 10}" y1="${cy - 3}" x2="${x + 10}" y2="${cy - 46}" class="note-stem" />`
      : `<line x1="${x - 10}" y1="${cy + 3}" x2="${x - 10}" y2="${cy + 46}" class="note-stem" />`
    const fill = state === 'done' ? `var(${ch.colorVar})` : 'var(--paper)'
    svg += `
      <a href="${ch.href}" class="melody-note ${state}" style="--note-color: var(${ch.colorVar}); --i: ${i}">
        <title>${ch.label} ${ch.title}</title>
        <ellipse cx="${x}" cy="${cy}" rx="11.5" ry="8.5" transform="rotate(-18 ${x} ${cy})" class="note-head" fill="${fill}" />
        ${stem}
        <text x="${x}" y="${staffTop + lineGap * 4 + 46}" class="note-chapter">${ch.label}</text>
        <text x="${x}" y="${staffTop + lineGap * 4 + 70}" class="note-title">${ch.title}</text>
      </a>`
  })

  svg += '</svg>'
  container.innerHTML = svg
  return container
}
