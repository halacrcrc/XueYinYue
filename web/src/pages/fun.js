// 音乐乐园：钢琴/吉他 + 鼓机 + 和声进行 的综合沙盒。
// 一个 ▶ 同时启动鼓与和声（同 BPM、同小节对齐），随时可只玩其中一样。

import { audio } from '../audio.js'
import { createPiano } from '../piano.js'
import { createFretboard } from '../fretboard.js'
import { createSequencer } from '../sequencer.js'
import {
  diatonic_triads as wasmDiatonic,
  progressions as wasmProgressions,
} from '../wasm/xueyinyue-core.js'

const TONICS = ['C', 'G', 'D', 'A', 'E', 'F']
const DEGREE_VARS = ['--do', '--re', '--mi', '--fa', '--sol', '--la', '--si']

function resolveVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function renderFun(main) {
  const state = {
    bpm: 100,
    tonic: 'C',
    preset: null,
    playing: false,
    bar: 0,
    barTimer: 0,
    instruments: [],
  }

  const presets = wasmProgressions()
  state.preset = presets[0]

  main.innerHTML = `
    <div class="fun-page">
      <a class="back-link" href="#/">← 首页</a>
      <h1 class="chapter-title">音乐乐园</h1>
      <p class="chapter-notice">没有对错，只有好玩：左手和声进行、右手鼓机、中间随便弹。按「合奏」让它们同时跑起来。</p>

      <div class="fun-transport">
        <button type="button" class="btn btn-primary" id="jam-btn">▶ 合奏</button>
        <label class="seq-bpm fun-bpm"><span>速度</span><input type="range" min="70" max="140" value="100" step="1" /><b>100 BPM</b></label>
        <span class="fun-hint">合奏 = 鼓机 + 和声进行同时开始、同速对齐；也完全可以只用其中一个。</span>
      </div>

      <section class="fun-block">
        <h2 class="section-title sm">和声进行</h2>
        <div class="fun-row">
          <div class="chips fun-tonics" aria-label="选择调"></div>
          <div class="chips fun-presets" aria-label="选择进行"></div>
        </div>
        <p class="fun-prog-desc"></p>
      </section>

      <section class="fun-block">
        <h2 class="section-title sm">鼓机</h2>
        <div class="fun-drums"></div>
      </section>

      <section class="fun-block">
        <div class="fun-instr-head">
          <h2 class="section-title sm">乐器台</h2>
          <div class="chips fun-instr-tabs" role="group" aria-label="选择乐器">
            <button type="button" class="chip is-active" data-instr="piano">钢琴</button>
            <button type="button" class="chip" data-instr="guitar">吉他</button>
            <div class="chips fun-label-tabs" role="group" aria-label="琴键标签">
              <button type="button" class="chip" data-label="name">音名</button>
              <button type="button" class="chip is-active" data-label="jianpu">简谱</button>
            </div>
          </div>
        </div>
        <div class="fun-instr"></div>
      </section>
    </div>
  `

  // ---------- 和声进行 ----------
  const tonicEl = main.querySelector('.fun-tonics')
  const presetEl = main.querySelector('.fun-presets')
  const descEl = main.querySelector('.fun-prog-desc')

  for (const t of TONICS) {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'chip' + (t === state.tonic ? ' is-active' : '')
    chip.textContent = t
    chip.addEventListener('click', () => {
      state.tonic = t
      tonicEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'))
      chip.classList.add('is-active')
      refreshProgression()
    })
    tonicEl.appendChild(chip)
  }
  for (const p of presets) {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'chip' + (p.id === state.preset.id ? ' is-active' : '')
    chip.textContent = p.nameZh
    chip.addEventListener('click', () => {
      state.preset = p
      presetEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'))
      chip.classList.add('is-active')
      refreshProgression()
    })
    presetEl.appendChild(chip)
  }

  function refreshProgression() {
    const triads = wasmDiatonic(state.tonic, 'major', 4)
    descEl.textContent = `${state.preset.nameZh}（${state.preset.degrees.map((d) => triads[d - 1].roman).join(' – ')}）：${state.preset.description}`
  }

  // ---------- 乐器台 ----------
  const instrEl = main.querySelector('.fun-instr')
  const tabsEl = main.querySelector('.fun-instr-tabs')
  const labelTabs = main.querySelector('.fun-label-tabs')
  let activeInstr = 'piano'
  let labelMode = 'jianpu'
  let piano = null
  let fretboard = null
  let currentInstr = null // 当前乐器句柄（钢琴或吉他），切换时只销毁它

  function mountInstrument(which) {
    currentInstr?.destroy?.()
    instrEl.innerHTML = ''
    activeInstr = which
    if (which === 'piano') {
      piano = createPiano(instrEl, { startMidi: 48, octaves: 3, keyboard: true })
      currentInstr = piano
    } else {
      fretboard = createFretboard(instrEl, {})
      currentInstr = fretboard
    }
    applyLabel()
  }

  function applyLabel() {
    const c = activeInstr === 'piano' ? piano : fretboard
    c.setKey(state.tonic, 'major')
    c.setLabel(labelMode)
  }
  // 直接全部显示：不做事前的音阶高亮圈，音名/简谱标签本身就是全部可见的

  tabsEl.querySelectorAll('[data-instr]').forEach((b) => {
    b.addEventListener('click', () => {
      tabsEl.querySelectorAll('[data-instr]').forEach((c) => c.classList.remove('is-active'))
      b.classList.add('is-active')
      mountInstrument(b.dataset.instr)
    })
  })
  labelTabs.querySelectorAll('[data-label]').forEach((b) => {
    b.addEventListener('click', () => {
      labelTabs.querySelectorAll('[data-label]').forEach((c) => c.classList.remove('is-active'))
      b.classList.add('is-active')
      labelMode = b.dataset.label
      applyLabel()
    })
  })

  // ---------- 鼓机 ----------
  const seq = createSequencer(main.querySelector('.fun-drums'), {
    bpm: state.bpm,
    pattern: { kick: [0, 4, 8, 12], hihat: [2, 6, 10, 14] },
  })

  // ---------- 合奏总线 ----------
  const jamBtn = main.querySelector('#jam-btn')
  const bpmInput = main.querySelector('.fun-bpm input')

  function stopAll() {
    state.playing = false
    clearTimeout(state.barTimer)
    seq.stop()
    jamBtn.textContent = '▶ 合奏'
    jamBtn.classList.remove('is-playing')
  }

  function playBar() {
    if (!state.playing) return
    const triads = wasmDiatonic(state.tonic, 'major', 4)
    const deg = state.preset.degrees[state.bar % state.preset.degrees.length]
    const triad = triads[deg - 1]
    const midis = triad.notes.map((n) => n.midi)
    const barDur = (60 / state.bpm) * 4
    // 吉他模式下和声进行也走吉他音色
    if (activeInstr === 'guitar') {
      audio.playGuitarNotes(midis, { duration: barDur * 0.9, velocity: 96, stagger: 0.03 })
    } else {
      audio.playNotes(midis, { duration: barDur * 0.9, velocity: 96 })
    }
    // 在乐器上闪亮当前和弦（唱名级数色）
    const c = activeInstr === 'piano' ? piano : fretboard
    if (c) {
      midis.forEach((m, i) => setTimeout(() => c.flash(m, { duration: 420 }), i * 30))
    }
    state.bar += 1
    state.barTimer = setTimeout(playBar, barDur * 1000)
  }

  jamBtn.addEventListener('click', () => {
    if (state.playing) {
      stopAll()
      return
    }
    audio.unlock()
    state.playing = true
    state.bar = 0
    seq.setBpm?.(state.bpm)
    seq.start()
    playBar()
    jamBtn.textContent = '■ 停止'
    jamBtn.classList.add('is-playing')
  })

  bpmInput.addEventListener('input', () => {
    state.bpm = Number(bpmInput.value)
    main.querySelector('.fun-bpm b').textContent = `${state.bpm} BPM`
  })

  refreshProgression()
  mountInstrument('piano')

  return {
    destroy() {
      stopAll()
      currentInstr?.destroy?.()
      seq.destroy()
      main.innerHTML = ''
    },
  }
}
