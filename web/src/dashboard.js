// 课程旋律图（首页签名元素）：用 VexFlow 真实乐谱字形渲染。
// 七个章节 = do re mi fa sol la si 七个音，唱名色与音符一一对应；
// 未开始 = 空心二分音符，进行中/完成 = 实心四分音符。点击进入章节。

import { Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow'

export const CHAPTERS = [
  { id: 'ch1', href: '#/chapter/1', label: '第一章', title: '声音与音名', colorVar: '--do' },
  { id: 'ch2', href: '#/chapter/2', label: '第二章', title: '节奏与节拍', colorVar: '--re' },
  { id: 'ch3', href: '#/chapter/3', label: '第三章', title: '音阶', colorVar: '--mi' },
  { id: 'ch4', href: '#/chapter/4', label: '第四章', title: '音程', colorVar: '--fa' },
  { id: 'ch5', href: '#/chapter/5', label: '第五章', title: '和弦', colorVar: '--sol' },
  { id: 'ch6', href: '#/chapter/6', label: '第六章', title: '和声进行', colorVar: '--la' },
  { id: 'ear', href: '#/ear', label: '训练场', title: '练耳训练场', colorVar: '--si' },
]

const NOTE_KEYS = ['c/4', 'd/4', 'e/4', 'f/4', 'g/4', 'a/4', 'b/4']
const NS = 'http://www.w3.org/2000/svg'

/**
 * 渲染课程旋律图。progress: { [chapterId]: 'unstarted'|'active'|'done' }
 */
export function buildMelodyMap(container, progress = {}) {
  container.innerHTML = ''
  const wrap = document.createElement('div')
  wrap.className = 'melody-fig'
  container.appendChild(wrap)

  const colors = ['--do', '--re', '--mi', '--fa', '--sol', '--la', '--si'].map((v) =>
    getComputedStyle(document.documentElement).getPropertyValue(v).trim()
  )

  const W = 1080
  const H = 280
  const renderer = new Renderer(wrap, Renderer.Backends.SVG)
  renderer.resize(W, H)
  const ctx = renderer.getContext()
  // 显式 viewBox：任意容器宽度下按矢量等比缩放，文字不拉伸不糊
  const svgEl = wrap.querySelector('svg')
  if (svgEl) svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`)

  const stave = new Stave(30, 40, W - 60)
  stave.addClef('treble')
  stave.setContext(ctx).draw()

  const notes = CHAPTERS.map((ch, i) => {
    const state = progress[ch.id] || 'unstarted'
    const n = new StaveNote({
      keys: [NOTE_KEYS[i]],
      duration: state === 'unstarted' ? 'h' : 'q', // 空心二分 / 实心四分
      clef: 'treble',
    })
    n.setStyle({ fillStyle: colors[i], strokeStyle: colors[i] })
    return n
  })

  const voice = new Voice({ num_beats: notes.length, beat_value: 4 })
  voice.setMode(Voice.Mode.SOFT)
  voice.addTickables(notes)
  new Formatter().joinVoices([voice]).format([voice], W - 170)

  notes.forEach((note, i) => {
    note.setStave(stave)
    const group = ctx.openGroup()
    note.setContext(ctx).draw()
    ctx.closeGroup()
    if (!group) return

    const ch = CHAPTERS[i]
    const state = progress[ch.id] || 'unstarted'
    group.classList.add('melody-note', state)
    group.style.setProperty('--i', i)
    group.style.setProperty('--note-color', colors[i])
    group.setAttribute('role', 'link')
    group.setAttribute('tabindex', '0')
    group.setAttribute('aria-label', `${ch.label} ${ch.title}`)

    // 章节标签（挂进同一组，整体可点）
    const cx = note.getAbsoluteX() + 10
    const addText = (y, text, cls) => {
      const t = document.createElementNS(NS, 'text')
      t.setAttribute('x', cx)
      t.setAttribute('y', y)
      t.setAttribute('text-anchor', 'middle')
      t.classList.add(cls)
      t.textContent = text
      group.appendChild(t)
    }
    addText(200, ch.label, 'note-chapter')
    addText(226, ch.title, 'note-title')

    const go = () => {
      location.hash = ch.href
    }
    group.addEventListener('click', go)
    group.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        go()
      }
    })
  })
}
