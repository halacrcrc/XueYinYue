// 交互钢琴组件：点击/触摸/电脑键盘，可演奏；
// 支持 高亮集合、唱名着色（调内级数）、标签（音名|简谱|无）、按压手感动画。

import { audio } from './audio.js'
import { jianpu_for_note } from './wasm/xueyinyue-core.js'

const BLACK_OFFSET = [1, 3, 6, 8, 10] // 相对白键 C 的黑键偏移
const DEGREE_VARS = ['--do', '--re', '--mi', '--fa', '--sol', '--la', '--si']

// 电脑键盘映射（标准 DAW 排列）：下排 = 起始八度，上排 = 高一个八度
const KEY_ROWS = [
  ['z', 's', 'x', 'd', 'c', 'v', 'g', 'b', 'h', 'n', 'j', 'm', ',', 'l', '.', ';', '/'],
  ['q', '2', 'w', '3', 'e', 'r', '5', 't', '6', 'y', '7', 'u', 'i', '9', 'o', '0', 'p'],
]

function isBlack(midi) {
  return BLACK_OFFSET.includes(((midi % 12) + 12) % 12)
}

export function createPiano(el, { startMidi = 60, octaves = 2, onNote = () => {}, keyboard = true } = {}) {
  const state = {
    label: 'name', // 'name' | 'jianpu' | 'none'
    key: null, // { tonic: 'C', mode: 'major' } 简谱/唱名上下文
    highlights: new Map(), // midi -> css color
  }

  const total = octaves * 12 + 1
  const midis = Array.from({ length: total }, (_, i) => startMidi + i)
  const whites = midis.filter((m) => !isBlack(m))
  const whiteW = 100 / whites.length
  const blackW = whiteW * 0.62

  el.classList.add('piano')
  el.setAttribute('role', 'group')
  el.setAttribute('aria-label', '钢琴键盘，点击或用电脑键盘弹奏')

  const keyEls = new Map()
  let whiteIndex = 0

  for (const midi of midis) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'piano-key' + (isBlack(midi) ? ' black' : ' white')
    btn.dataset.midi = midi
    btn.setAttribute('aria-label', `琴键 ${midiToLabel(midi, 'name')}`)

    const label = document.createElement('span')
    label.className = 'key-label'
    btn.appendChild(label)

    const degreeBar = document.createElement('span')
    degreeBar.className = 'key-degree-bar'
    btn.appendChild(degreeBar)

    if (isBlack(midi)) {
      // 黑键：横跨其左侧白键的右边界
      const left = (whiteIndex - 0.31) * whiteW
      btn.style.left = `calc(${left}% )`
      btn.style.width = `${blackW}%`
    } else {
      btn.style.left = `${whiteIndex * whiteW}%`
      btn.style.width = `${whiteW}%`
      whiteIndex += 1
    }

    // 指针事件：按下发声，抬起/离开复位（setPointerCapture 保证拖出仍能抬起）
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      btn.setPointerCapture(e.pointerId)
      press(midi)
    })
    const release = () => unpress(midi)
    btn.addEventListener('pointerup', release)
    btn.addEventListener('pointercancel', release)
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        press(midi)
      }
    })
    btn.addEventListener('keyup', (e) => {
      if (e.key === 'Enter' || e.key === ' ') unpress(midi)
    })

    el.appendChild(btn)
    keyEls.set(midi, btn)
  }

  // ---- 电脑键盘映射（可用 keyboard: false 关闭，用于多钢琴共存的页面）----
  const heldKeys = new Set()
  const onDocKey = (e) => {
    if (!keyboard) return
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
    const k = e.key.toLowerCase()
    for (let row = 0; row < KEY_ROWS.length; row++) {
      const idx = KEY_ROWS[row].indexOf(k)
      if (idx >= 0) {
        const midi = startMidi + row * 12 + idx
        if (!keyEls.has(midi)) return
        if (e.type === 'keydown') {
          heldKeys.add(k)
          press(midi)
        } else if (heldKeys.delete(k)) {
          unpress(midi)
        }
        return
      }
    }
  }
  document.addEventListener('keydown', onDocKey)
  document.addEventListener('keyup', onDocKey)

  // ---- 行为 ----
  function press(midi, { sound = true } = {}) {
    const btn = keyEls.get(midi)
    if (!btn) return
    btn.classList.add('is-pressed')
    if (sound) audio.playNote(midi, { velocity: 96 })
    onNote(midi)
  }
  function unpress(midi) {
    keyEls.get(midi)?.classList.remove('is-pressed')
  }

  function midiToLabel(midi, mode) {
    if (mode !== 'name') return ''
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    return names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1)
  }

  function refreshLabels() {
    for (const [midi, btn] of keyEls) {
      const label = btn.querySelector('.key-label')
      const bar = btn.querySelector('.key-degree-bar')
      if (state.label === 'name') {
        label.textContent = midiToLabel(midi, 'name').replace(/\d/, '')
        btn.removeAttribute('data-degree')
        bar.style.background = 'transparent'
      } else if (state.label === 'jianpu' && state.key) {
        try {
          const j = jianpu_for_note(state.key.tonic, state.key.mode, nameForMidi(midi), 4)
          const acc = j.accidental > 0 ? '♯' : j.accidental < 0 ? '♭' : ''
          const dotsHi = '·'.repeat(Math.max(0, j.octaveOffset))
          const dotsLo = '·'.repeat(Math.max(0, -j.octaveOffset))
          label.innerHTML = ''
          if (dotsHi) {
            const hi = document.createElement('i')
            hi.className = 'dots hi'
            hi.textContent = dotsHi
            label.appendChild(hi)
          }
          const d = document.createElement('b')
          d.textContent = `${acc}${j.digit}`
          label.appendChild(d)
          if (dotsLo) {
            const lo = document.createElement('i')
            lo.className = 'dots lo'
            lo.textContent = dotsLo
            label.appendChild(lo)
          }
          btn.dataset.degree = j.digit
          bar.style.background = `var(${DEGREE_VARS[j.digit - 1]})`
        } catch {
          label.textContent = ''
        }
      } else {
        label.textContent = ''
        btn.removeAttribute('data-degree')
        bar.style.background = 'transparent'
      }
    }
  }

  function nameForMidi(midi) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    return names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1)
  }

  // 初始渲染一次标签（默认音名模式）
  refreshLabels()

  return {
    el,
    /** label: 'name' | 'jianpu' | 'none' */
    setLabel(mode) {
      state.label = mode
      refreshLabels()
    },
    /** 设置简谱上下文（tonic 如 'C'，mode 如 'major'），键级获得唱名色 */
    setKey(tonic, mode = 'major') {
      state.key = { tonic, mode }
      refreshLabels()
    },
    /** 高亮一组键：entries = [[midi, cssColor], ...] 或纯 [midi, ...]（默认陶土色） */
    setHighlights(entries) {
      this.clearHighlights()
      for (const entry of entries) {
        const [midi, color] = Array.isArray(entry) ? entry : [entry, null]
        const btn = keyEls.get(midi)
        if (!btn) continue
        state.highlights.set(midi, color)
        btn.classList.add('is-highlighted')
        btn.style.setProperty('--hl', color || 'var(--clay)')
      }
    },
    clearHighlights() {
      for (const [midi] of state.highlights) {
        const btn = keyEls.get(midi)
        btn?.classList.remove('is-highlighted')
        btn?.style.removeProperty('--hl')
      }
      state.highlights.clear()
    },
    /** 按下并短暂展示（自动播放示范 / 答题反馈） */
    flash(midi, { duration = 500, velocity = 96, color } = {}) {
      const btn = keyEls.get(midi)
      press(midi, { sound: true })
      if (btn && color) {
        btn.style.setProperty('--hl', color)
        btn.classList.add('is-highlighted')
        setTimeout(() => {
          btn.classList.remove('is-highlighted')
          btn.style.removeProperty('--hl')
        }, duration)
      }
      setTimeout(() => unpress(midi), Math.min(220, duration))
    },
    /** 静音演示一串音（stagger 秒间隔），返回总时长 */
    demonstrate(midis, { stagger = 0.28, color } = {}) {
      midis.forEach((m, i) => {
        setTimeout(() => this.flash(m, { duration: 300, color }), i * stagger * 1000)
      })
      return midis.length * stagger * 1000
    },
    destroy() {
      document.removeEventListener('keydown', onDocKey)
      document.removeEventListener('keyup', onDocKey)
      el.innerHTML = ''
    },
    _refresh: refreshLabels,
  }
}
