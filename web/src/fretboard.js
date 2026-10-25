// 吉他指板组件：6 弦 × 0–12 品，可点击发声；
// 标签（音名|简谱|无）、调内级数着色、高亮集合（展示音阶位置）。

import { audio } from './audio.js'
import { jianpu_for_note } from './wasm/xueyinyue-core.js'

const DEGREE_VARS = ['--do', '--re', '--mi', '--fa', '--sol', '--la', '--si']
// 从上到下：高音 E 弦在前
const STRINGS = [
  { name: 'E', midi: 64 },
  { name: 'B', midi: 59 },
  { name: 'G', midi: 55 },
  { name: 'D', midi: 50 },
  { name: 'A', midi: 45 },
  { name: 'E', midi: 40 },
]
const FRETS = 12
const NAME_TABLE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function midiName(midi) {
  return NAME_TABLE[((midi % 12) + 12) % 12]
}

export function createFretboard(el, { label = 'name', key = null, onNote = () => {} } = {}) {
  const state = { label, key, highlights: new Set() }
  el.classList.add('fretboard')
  el.setAttribute('role', 'group')
  el.setAttribute('aria-label', '吉他指板，点击品格发声')

  // 品位标尺
  const ruler = document.createElement('div')
  ruler.className = 'fb-ruler'
  ruler.innerHTML =
    '<span class="fb-string-label"></span>' +
    Array.from({ length: FRETS + 1 }, (_, f) =>
      [3, 5, 7, 9, 12].includes(f) ? `<span class="fb-fret-no">${f}</span>` : '<span></span>'
    ).join('')
  el.appendChild(ruler)

  const cells = [] // 全部品格（同一 midi 可能在多根弦上出现）

  for (const str of STRINGS) {
    const row = document.createElement('div')
    row.className = 'fb-row'
    const label = document.createElement('span')
    label.className = 'fb-string-label'
    label.textContent = str.name
    row.appendChild(label)
    for (let f = 0; f <= FRETS; f++) {
      const midi = str.midi + f
      const cell = document.createElement('button')
      cell.type = 'button'
      cell.className = 'fb-cell' + (f === 0 ? ' is-open' : '') + ([3, 5, 7, 9, 12].includes(f) ? ' is-marker' : '')
      cell.dataset.midi = midi
      cell.setAttribute('aria-label', `吉他 ${str.name} 弦 ${f} 品（${midiName(midi)}）`)
      cell.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        press(midi)
      })
      cell.addEventListener('pointerup', () => cell.classList.remove('is-pressed'))
      cell.addEventListener('pointerleave', () => cell.classList.remove('is-pressed'))
      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          press(midi)
        }
      })
      cell.addEventListener('keyup', (e) => {
        if (e.key === ' ' || e.key === 'Enter') cell.classList.remove('is-pressed')
      })
      row.appendChild(cell)
      cells.push(cell)
    }
    el.appendChild(row)
  }

  function press(midi) {
    const hit = cells.filter((c) => c.dataset.midi === String(midi))
    hit.forEach((c) => c.classList.add('is-pressed'))
    setTimeout(() => hit.forEach((c) => c.classList.remove('is-pressed')), 200)
    audio.playNote(midi, { velocity: 98 })
    onNote(midi)
  }

  function nameFor(midi) {
    return midiName(midi) + (Math.floor(midi / 12) - 1)
  }

  function refreshLabels() {
    for (const cell of cells) {
      const midi = Number(cell.dataset.midi)
      cell.innerHTML = ''
      cell.removeAttribute('data-degree')
      if (state.label === 'name') {
        const s = document.createElement('span')
        s.textContent = midiName(midi)
        cell.appendChild(s)
      } else if (state.label === 'jianpu' && state.key) {
        try {
          const j = jianpu_for_note(state.key.tonic, state.key.mode, nameFor(midi), 4)
          const acc = j.accidental > 0 ? '♯' : j.accidental < 0 ? '♭' : ''
          const s = document.createElement('span')
          s.textContent = `${acc}${j.digit}`
          cell.appendChild(s)
          cell.dataset.degree = j.digit
        } catch {
          /* 单键容错 */
        }
      }
    }
  }
  refreshLabels()

  return {
    el,
    setLabel(mode) {
      state.label = mode
      refreshLabels()
    },
    setKey(tonic, mode = 'major') {
      state.key = { tonic, mode }
      refreshLabels()
    },
    /** 高亮一组 midi（音阶位置展示；同音异位的品格会一起亮） */
    setHighlights(midis) {
      state.highlights = new Set(midis)
      for (const cell of cells) {
        cell.classList.toggle('is-highlighted', state.highlights.has(Number(cell.dataset.midi)))
      }
    },
    flash(midi, { duration = 400 } = {}) {
      const hit = cells.filter((c) => c.dataset.midi === String(midi))
      if (!hit.length) return
      hit.forEach((c) => c.classList.add('is-flash'))
      setTimeout(() => hit.forEach((c) => c.classList.remove('is-flash')), duration)
    },
    destroy() {
      el.innerHTML = ''
    },
  }
}
