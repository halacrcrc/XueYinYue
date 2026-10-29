// 和弦/音阶查询器：选根音 + 类型 → 钢琴 / 吉他指板 / 五线谱 三视图同步显示。
// 乐理数据全部来自 Rust WASM（scale / triad_chord / seventh_chord_notes / jianpu_for_note），
// 本模块只做呈现、三视图联动与发声，不自行推导任何乐理。

import { audio } from '../audio.js'
import { createPiano } from '../piano.js'
import { createFretboard } from '../fretboard.js'
import { renderStaff } from '../staff.js'
import { renderJianpu } from '../jianpu.js'
import {
  scale as wasmScale,
  triad_chord as wasmTriad,
  seventh_chord_notes as wasmSeventh,
  jianpu_for_note,
} from '../wasm/xueyinyue-core.js'
import './query.css'

const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

const FAMILIES = [
  {
    id: 'scale',
    name: '音阶',
    types: [
      { id: 'major', name: '大调' },
      { id: 'naturalMinor', name: '自然小调' },
      { id: 'majorPentatonic', name: '大调五声' },
    ],
  },
  {
    id: 'chord',
    name: '和弦',
    types: [
      { id: 'major', name: '大三' },
      { id: 'minor', name: '小三' },
      { id: 'augmented', name: '增三' },
      { id: 'diminished', name: '减三' },
      { id: 'dominant', name: '属七' },
      { id: 'major7', name: '大七' },
      { id: 'minor7', name: '小七' },
    ],
  },
]

const SEVENTH_IDS = new Set(['dominant', 'major7', 'minor7'])
// 七和弦 DTO 的 symbol 在 Rust 侧对大七/小七统一输出 "maj7/m7"（lib.rs 的已知瑕疵），
// 展示用记号在前端按性质补一个后缀（纯呈现，不算乐理计算）。
const SEVENTH_SUFFIX = { dominant: '7', major7: 'maj7', minor7: 'm7' }

const DEGREE_VARS = ['--do', '--re', '--mi', '--fa', '--sol', '--la', '--si']
// 和弦音的简谱上下文：以根音大调为参照（C7 → 1 3 5 ♭7，Cm → 1 ♭3 5 的通用记法）
const CHORD_KEY_MODE = 'major'
// 吉他指板 6 弦 × 0–12 品覆盖的 midi 范围（低音 E2=40 … 高音 E 弦 12 品=76）
const FRET_LOW = 40
const FRET_HIGH = 76

const pc = (midi) => ((midi % 12) + 12) % 12
const resolveVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
const stripOctave = (name) => name.replace(/\d+$/, '')

/** NoteDto → VexFlow key（如 Bb4 → "bb/4"，staff.js 约定小写） */
function vexKey(n) {
  const acc = n.accidental > 0 ? '#'.repeat(n.accidental) : 'b'.repeat(-n.accidental)
  return `${n.letter.toLowerCase()}${acc}/${n.octave}`
}

export function renderQuery(main) {
  const state = {
    root: 'C',
    family: FAMILIES[0],
    type: FAMILIES[0].types[0],
    labelMode: 'jianpu',
  }
  let currentMidis = []
  // 组成音成员键（钢琴/指板标签修正用）：[{ midi, spelling, jianpu }]
  let lastMembers = []

  main.innerHTML = `
    <div class="qy-page">
      <a class="back-link" href="#/">← 首页</a>
      <h1 class="chapter-title">和弦 / 音阶查询器</h1>
      <p class="chapter-notice">选一个根音和性质，钢琴、吉他、五线谱同时告诉你它长什么样。点琴键或品格可以直接弹。</p>

      <section class="qy-picker">
        <div class="qy-row" role="group" aria-label="选择类别">
          <span class="qy-row-label">类别</span>
          <div class="qy-opts qy-family"></div>
        </div>
        <div class="qy-row" role="group" aria-label="选择类型">
          <span class="qy-row-label">类型</span>
          <div class="qy-opts qy-types"></div>
        </div>
        <div class="qy-row" role="group" aria-label="选择根音">
          <span class="qy-row-label">根音</span>
          <div class="qy-opts qy-roots"></div>
        </div>
      </section>

      <section class="qy-head">
        <div class="qy-title-row">
          <h2 class="qy-name"></h2>
          <span class="qy-badge"></span>
          <button type="button" class="btn btn-primary qy-play">▶ 播放</button>
        </div>
        <p class="qy-meta"></p>
        <div class="qy-jianpu"></div>
        <p class="qy-error" hidden></p>
      </section>

      <section class="qy-view">
        <div class="qy-view-head">
          <h3 class="section-title sm">钢琴</h3>
          <div class="qy-opts" role="group" aria-label="琴键标签">
            <button type="button" class="qy-chip qy-chip-sm" data-label="name">音名</button>
            <button type="button" class="qy-chip qy-chip-sm" data-label="jianpu">简谱</button>
          </div>
        </div>
        <div class="qy-piano-mount"></div>
      </section>

      <section class="qy-view">
        <h3 class="section-title sm">吉他指板</h3>
        <div class="qy-fret-mount"></div>
      </section>

      <section class="qy-view">
        <h3 class="section-title sm">五线谱</h3>
        <div class="qy-staff"></div>
      </section>
    </div>
  `

  const nameEl = main.querySelector('.qy-name')
  const badgeEl = main.querySelector('.qy-badge')
  const metaEl = main.querySelector('.qy-meta')
  const jianpuEl = main.querySelector('.qy-jianpu')
  const errorEl = main.querySelector('.qy-error')
  const familyEl = main.querySelector('.qy-family')
  const typesEl = main.querySelector('.qy-types')
  const rootsEl = main.querySelector('.qy-roots')
  const staffEl = main.querySelector('.qy-staff')

  const piano = createPiano(main.querySelector('.qy-piano-mount'), {
    startMidi: 48,
    octaves: 3, // 48–84，覆盖 octave=4 起的音阶（最高 B5=83）与和弦
    keyboard: true,
  })
  const fretboard = createFretboard(main.querySelector('.qy-fret-mount'), {
    label: state.labelMode,
  })

  // ---------- 选择器 ----------
  for (const f of FAMILIES) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'qy-chip'
    b.textContent = f.name
    b.dataset.family = f.id
    b.addEventListener('click', () => {
      state.family = f
      state.type = f.types[0]
      refreshPickers()
      update()
    })
    familyEl.appendChild(b)
  }
  for (const t of state.family.types) {
    typesEl.appendChild(makeTypeChip(t))
  }
  for (const r of ROOTS) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'qy-chip'
    b.textContent = r
    b.dataset.root = r
    b.addEventListener('click', () => {
      state.root = r
      refreshPickers()
      update()
    })
    rootsEl.appendChild(b)
  }

  function makeTypeChip(t) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'qy-chip'
    b.textContent = t.name
    b.dataset.type = t.id
    b.addEventListener('click', () => {
      state.type = t
      refreshPickers()
      update()
    })
    return b
  }

  function refreshPickers() {
    // 类型组随类别切换重建（音阶 3 种 / 和弦 7 种）
    typesEl.innerHTML = ''
    for (const t of state.family.types) typesEl.appendChild(makeTypeChip(t))
    for (const b of familyEl.querySelectorAll('.qy-chip')) {
      b.classList.toggle('is-active', b.dataset.family === state.family.id)
    }
    for (const b of typesEl.querySelectorAll('.qy-chip')) {
      b.classList.toggle('is-active', b.dataset.type === state.type.id)
    }
    for (const b of rootsEl.querySelectorAll('.qy-chip')) {
      b.classList.toggle('is-active', b.dataset.root === state.root)
    }
  }

  // 琴键标签切换（钢琴 + 指板一起）
  main.querySelectorAll('[data-label]').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.label === state.labelMode)
    b.addEventListener('click', () => {
      state.labelMode = b.dataset.label
      main.querySelectorAll('[data-label]').forEach((x) => {
        x.classList.toggle('is-active', x.dataset.label === state.labelMode)
      })
      piano.setLabel(state.labelMode)
      fretboard.setLabel(state.labelMode)
      applyMemberLabels()
    })
  })

  // ---------- 成员键标签修正 ----------
  // piano.js / fretboard.js 内部用升号表（midi 70 → 'A#'）去问 Rust 简谱，
  // 降号根音下成员键会被错标（Bb4 显示成 ♯7 而不是 1）。
  // 两个共享组件不在本模块所有权内，所以在每次刷新后
  // 用 Rust 返回的拼写（NoteDto.name + jianpu 字段）覆写成员键/品格的标签。
  function applyMemberLabels() {
    const accMark = (a) => (a > 0 ? '♯' : a < 0 ? '♭' : '')
    for (const m of lastMembers) {
      // 钢琴：标签 + 级数条（成员键才覆写，其余键保持组件自己的渲染）
      const btn = main.querySelector(`.qy-piano-mount .piano-key[data-midi="${m.midi}"]`)
      if (btn) {
        const label = btn.querySelector('.key-label')
        const bar = btn.querySelector('.key-degree-bar')
        if (state.labelMode === 'name') {
          label.textContent = m.spelling
          btn.removeAttribute('data-degree')
          bar.style.background = 'transparent'
        } else {
          const j = m.jianpu
          label.innerHTML = ''
          if (j.octaveOffset > 0) {
            const hi = document.createElement('i')
            hi.className = 'dots hi'
            hi.textContent = '·'.repeat(j.octaveOffset)
            label.appendChild(hi)
          }
          const d = document.createElement('b')
          d.textContent = `${accMark(j.accidental)}${j.digit}`
          label.appendChild(d)
          if (j.octaveOffset < 0) {
            const lo = document.createElement('i')
            lo.className = 'dots lo'
            lo.textContent = '·'.repeat(-j.octaveOffset)
            label.appendChild(lo)
          }
          btn.dataset.degree = j.digit
          bar.style.background = `var(${DEGREE_VARS[j.digit - 1]})`
        }
      }
      // 指板：同一 midi 会出现在多根弦上，全部覆写
      main.querySelectorAll(`.qy-fret-mount .fb-cell[data-midi="${m.midi}"]`).forEach((cell) => {
        cell.innerHTML = ''
        cell.removeAttribute('data-degree')
        const s = document.createElement('span')
        if (state.labelMode === 'name') {
          s.textContent = m.spelling
        } else {
          s.textContent = `${accMark(m.jianpu.accidental)}${m.jianpu.digit}`
          cell.dataset.degree = m.jianpu.digit
        }
        cell.appendChild(s)
      })
    }
  }

  // ---------- 查询 + 三视图同步 ----------
  function compute() {
    if (state.family.id === 'scale') return wasmScale(state.root, state.type.id, 4)
    if (SEVENTH_IDS.has(state.type.id)) return wasmSeventh(state.root, state.type.id, 4)
    return wasmTriad(state.root, state.type.id, 4)
  }

  function update() {
    errorEl.hidden = true
    let data
    try {
      data = compute()
    } catch (e) {
      errorEl.hidden = false
      errorEl.textContent = `查询失败：${e?.message || e}`
      return
    }
    const notes = data.notes
    const isScale = state.family.id === 'scale'
    // 成员音的简谱（着色/五线谱/琴键标签共用）：
    // 音阶直接用返回的 notes[].jianpu 字段；和弦 DTO 无 jianpu，
    // 走 jianpu_for_note（根音大调上下文，与琴键标签一致）。
    const jianpuList = notes.map((n) =>
      isScale ? n.jianpu : jianpu_for_note(state.root, CHORD_KEY_MODE, n.name, 4)
    )
    const digits = jianpuList.map((j) => j.digit)
    const spellings = notes.map((n) => stripOctave(n.name))
    lastMembers = notes.map((n, i) => ({ midi: n.midi, spelling: spellings[i], jianpu: jianpuList[i] }))

    // 简谱行
    const jpItems = jianpuList.map((j) => ({
      digit: j.digit,
      octaveOffset: j.octaveOffset,
      accidental: j.accidental,
      solfege: j.solfege,
    }))

    nameEl.textContent = isScale ? `${data.tonicZh} ${data.kindZh}` : `${stripOctave(data.root.name)} ${data.qualityZh}`
    badgeEl.textContent = isScale ? data.tonic : `${stripOctave(data.root.name)}${SEVENTH_SUFFIX[state.type.id] || ''}`
    metaEl.textContent = isScale
      ? `组成音：${spellings.join(' ')}｜音程结构：${data.stepLabels.join(' – ')}`
      : `组成音：${spellings.join(' ')}｜半音数：${data.semitoneIntervals.join(' – ')}`
    renderJianpu(jianpuEl, jpItems, {})

    // 钢琴：简谱上下文 + 级数色高亮
    const keyMode = isScale ? state.type.id : CHORD_KEY_MODE
    piano.setKey(state.root, keyMode)
    piano.setLabel(state.labelMode)
    piano.setHighlights(notes.map((n, i) => [n.midi, resolveVar(DEGREE_VARS[(digits[i] - 1) % 7])]))

    // 吉他指板：0–12 品内所有组成音位置（同音异弦一起亮）
    fretboard.setKey(state.root, keyMode)
    fretboard.setLabel(state.labelMode)
    const pcs = new Set(notes.map((n) => pc(n.midi)))
    const fretMidis = []
    for (let m = FRET_LOW; m <= FRET_HIGH; m++) {
      if (pcs.has(pc(m))) fretMidis.push(m)
    }
    fretboard.setHighlights(fretMidis)

    // 五线谱：保留 Rust 拼写（含 Bbb/Cb 这类），级数着色
    renderStaff(staffEl, notes.map((n, i) => ({ key: vexKey(n), degree: digits[i] })))
    // renderStaff 的 SVG 带 VexFlow resize 写入的内联定宽（如 width:546px），
    // 窄屏会撑破面板；有 viewBox 在，转成 100% 即可等比缩放
    const svg = staffEl.querySelector('svg')
    if (svg) {
      svg.style.width = '100%'
      svg.style.height = 'auto'
    }

    currentMidis = notes.map((n) => n.midi)
    applyMemberLabels()
  }

  // ---------- 播放 ----------
  main.querySelector('.qy-play').addEventListener('click', () => {
    if (!currentMidis.length) return
    if (state.family.id === 'scale') {
      audio.playNotes(currentMidis, { duration: 1.4, velocity: 100, stagger: 0.3 })
      // 指板静默闪光跟随（flash 不发声，避免与音源重叠）
      currentMidis.forEach((m, i) => setTimeout(() => fretboard.flash(m, { duration: 360 }), i * 300))
    } else {
      audio.playNotes(currentMidis, { duration: 2.6, velocity: 104 })
      currentMidis.forEach((m, i) => setTimeout(() => fretboard.flash(m, { duration: 700 }), i * 60))
    }
  })

  refreshPickers()
  update()

  return {
    destroy() {
      piano.destroy()
      fretboard.destroy()
      main.innerHTML = ''
    },
  }
}
