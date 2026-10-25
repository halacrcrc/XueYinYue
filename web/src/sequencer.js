// 步进音序器：16 格 × 4 鼓（底鼓/军鼓/踩镲/拍手），BPM 可调，播放头扫过时当前列微抬。

import { audio, DRUM_NAMES } from './audio.js'

const LANE_LABELS = { kick: '底鼓', snare: '军鼓', hihat: '踩镲', clap: '拍手' }
const LANE_COLORS = { kick: '--do', snare: '--re', hihat: '--mi', clap: '--sol' }

export function createSequencer(el, { steps = 16, bpm = 96, pattern = null } = {}) {
  const state = {
    bpm,
    playing: false,
    // pattern[lane] = Set(step)
    pattern: Object.fromEntries(DRUM_NAMES.map((d) => [d, new Set()])),
  }
  if (pattern) {
    for (const [lane, arr] of Object.entries(pattern)) {
      if (state.pattern[lane]) arr.forEach((s) => state.pattern[lane].add(s))
    }
  }

  el.classList.add('sequencer')
  el.innerHTML = ''

  // ---- 顶栏：播放/停止 + BPM ----
  const bar = document.createElement('div')
  bar.className = 'seq-bar'
  const playBtn = document.createElement('button')
  playBtn.type = 'button'
  playBtn.className = 'btn btn-primary seq-play'
  playBtn.textContent = '▶ 播放'
  const bpmLabel = document.createElement('label')
  bpmLabel.className = 'seq-bpm'
  bpmLabel.innerHTML = `<span>速度</span><input type="range" min="60" max="160" value="${bpm}" step="1" /><b>${bpm} BPM</b>`
  const clearBtn = document.createElement('button')
  clearBtn.type = 'button'
  clearBtn.className = 'btn btn-ghost seq-clear'
  clearBtn.textContent = '清空'
  bar.append(playBtn, clearBtn, bpmLabel)
  el.appendChild(bar)

  // ---- 网格 ----
  const grid = document.createElement('div')
  grid.className = 'seq-grid'
  grid.style.setProperty('--steps', steps)
  // 表头行：小节号（每 4 格一组）
  const head = document.createElement('div')
  head.className = 'seq-row seq-head'
  head.innerHTML = `<span class="seq-lane-label"></span>` + Array.from({ length: steps }, (_, i) =>
    i % 4 === 0 ? `<span class="seq-beat-no">${i / 4 + 1}</span>` : '<span></span>'
  ).join('')
  grid.appendChild(head)

  const cellEls = {}
  for (const lane of DRUM_NAMES) {
    const row = document.createElement('div')
    row.className = 'seq-row'
    const label = document.createElement('span')
    label.className = 'seq-lane-label'
    label.style.setProperty('--lane', `var(${LANE_COLORS[lane]})`)
    label.textContent = LANE_LABELS[lane]
    row.appendChild(label)
    cellEls[lane] = []
    for (let s = 0; s < steps; s++) {
      const cell = document.createElement('button')
      cell.type = 'button'
      cell.className = 'seq-cell' + (s % 4 === 0 ? ' is-beat' : '')
      cell.dataset.lane = lane
      cell.dataset.step = s
      cell.setAttribute('aria-label', `${LANE_LABELS[lane]} 第 ${s + 1} 格`)
      const sync = () => {
        cell.classList.toggle('is-on', state.pattern[lane].has(s))
      }
      cell.addEventListener('click', () => {
        if (state.pattern[lane].has(s)) state.pattern[lane].delete(s)
        else state.pattern[lane].add(s)
        sync()
        // 点亮试听（播放中交给走带；停止时立即给反馈）
        if (!state.playing) audio.playDrum(lane, { velocity: 100 })
      })
      sync()
      row.appendChild(cell)
      cellEls[lane].push(cell)
    }
    grid.appendChild(row)
  }
  el.appendChild(grid)

  // ---- 走带（lookahead 调度）----
  let timer = 0
  let nextStepTime = 0
  let nextStep = 0
  const LOOKAHEAD = 0.14
  const TICK = 30

  const stepDur = () => 60 / state.bpm / 4 // 十六分音符

  function scheduler() {
    const ctx = audio.ctx
    while (nextStepTime < ctx.currentTime + LOOKAHEAD) {
      const step = nextStep
      const time = nextStepTime
      for (const lane of DRUM_NAMES) {
        if (state.pattern[lane].has(step)) audio.playDrum(lane, { time, velocity: 108 })
      }
      // 播放头视觉（按计划时刻触发）
      const delay = Math.max(0, (time - ctx.currentTime) * 1000)
      setTimeout(() => highlightColumn(step), delay)
      nextStepTime += stepDur()
      nextStep = (nextStep + 1) % steps
    }
  }

  function highlightColumn(step) {
    grid.querySelectorAll('.seq-cell.is-cursor, .seq-beat-no.is-cursor').forEach((c) => c.classList.remove('is-cursor'))
    for (const lane of DRUM_NAMES) cellEls[lane][step]?.classList.add('is-cursor')
    const no = head.querySelectorAll('.seq-beat-no')[Math.floor(step / 4)]
    no?.classList.add('is-cursor')
  }

  function start() {
    const ctx = audio.unlock()
    state.playing = true
    playBtn.textContent = '■ 停止'
    playBtn.classList.add('is-playing')
    nextStep = 0
    nextStepTime = ctx.currentTime + 0.08
    timer = setInterval(scheduler, TICK)
    scheduler()
  }

  function stop() {
    state.playing = false
    playBtn.textContent = '▶ 播放'
    playBtn.classList.remove('is-playing')
    clearInterval(timer)
    grid.querySelectorAll('.is-cursor').forEach((c) => c.classList.remove('is-cursor'))
  }

  playBtn.addEventListener('click', () => (state.playing ? stop() : start()))
  clearBtn.addEventListener('click', () => {
    for (const lane of DRUM_NAMES) state.pattern[lane].clear()
    grid.querySelectorAll('.seq-cell.is-on').forEach((c) => c.classList.remove('is-on'))
  })
  const slider = bpmLabel.querySelector('input')
  slider.addEventListener('input', () => {
    state.bpm = Number(slider.value)
    bpmLabel.querySelector('b').textContent = `${state.bpm} BPM`
  })

  return {
    el,
    /** 供外部（音乐乐园合奏）程序化启动 */
    start,
    /** 供外部同步 BPM（面板滑块与显示一并更新） */
    setBpm(v) {
      state.bpm = v
      slider.value = String(v)
      slider.dispatchEvent(new Event('input'))
    },
    setPattern(next) {
      for (const [lane, arr] of Object.entries(next)) {
        state.pattern[lane].clear()
        arr.forEach((s) => state.pattern[lane].add(s))
        cellEls[lane].forEach((c, i) => c.classList.toggle('is-on', state.pattern[lane].has(i)))
      }
    },
    getPattern() {
      return Object.fromEntries(
        DRUM_NAMES.map((d) => [d, [...state.pattern[d]].sort((a, b) => a - b)])
      )
    },
    stop,
    destroy() {
      stop()
      el.innerHTML = ''
    },
  }
}
