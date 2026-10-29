// 节拍器：BPM 40–208、拍号 2/3/4/6 拍、每小节第一拍重音。
// 重音 = 底鼓（低音），弱拍 = 踩镲（高音），直接用 audio.playDrum。
// 调度走 lookahead 模式（参照 sequencer.js 的 scheduler 写法）；
// 任何发声/排程前必须先 audio.unlock()——浏览器要求音频在用户手势后启动。

import './metronome.css'
import { audio } from '../audio.js'

const TIME_SIGS = [2, 3, 4, 6]
const LOOKAHEAD = 0.14 // 提前量（秒），与 sequencer.js 一致
const TICK = 30 // 调度器轮询间隔（毫秒）

export function renderMetronome(main) {
  const state = { bpm: 100, beats: 4, playing: false }

  main.innerHTML = `
    <div class="metro-page">
      <a class="back-link" href="#/">← 首页</a>
      <h1 class="chapter-title">节拍器</h1>
      <p class="chapter-notice">稳住脉搏：每小节第一拍是重音（底鼓，低），其余是弱拍（踩镲，高）。先选拍号，再拖速度，按开始。</p>

      <div class="metro-panel">
        <div class="metro-dots" aria-hidden="true"></div>

        <div class="metro-transport">
          <button type="button" class="btn btn-primary metro-play">▶ 开始</button>
          <label class="seq-bpm metro-bpm">
            <span>速度</span>
            <input type="range" min="40" max="208" value="${state.bpm}" step="1" aria-label="速度 BPM" />
            <b>${state.bpm} BPM</b>
          </label>
        </div>

        <div class="metro-timesig">
          <span class="metro-label">拍号</span>
          <div class="chips metro-chips" role="group" aria-label="每小节拍数"></div>
        </div>

        <p class="metro-hint">播放中随时拖速度、换拍号，立即生效。</p>
      </div>
    </div>
  `

  const dotsEl = main.querySelector('.metro-dots')
  const playBtn = main.querySelector('.metro-play')
  const chipsEl = main.querySelector('.metro-chips')
  const bpmLabel = main.querySelector('.metro-bpm')
  const slider = bpmLabel.querySelector('input')

  // ---- 拍点行：每拍一个圆点，首拍重音（do 红=低），弱拍（sol 蓝=高）----
  let dotSlots = []

  function buildDots() {
    dotsEl.innerHTML = ''
    dotSlots = []
    for (let i = 0; i < state.beats; i++) {
      const slot = document.createElement('span')
      slot.className = 'metro-slot' + (i === 0 ? ' is-accent' : '')
      slot.innerHTML = `<i class="metro-dot"></i><em>${i + 1}</em>`
      dotsEl.appendChild(slot)
      dotSlots.push(slot)
    }
  }

  function flashBeat(beat) {
    if (!state.playing) return // 停止后迟到的定时器不再闪
    dotSlots.forEach((s, i) => s.classList.toggle('is-now', i === beat))
  }

  function clearFlash() {
    dotSlots.forEach((s) => s.classList.remove('is-now'))
  }

  // ---- 走带（lookahead 调度）----
  let timer = 0
  let nextBeatTime = 0
  let nextBeat = 0

  const beatDur = () => 60 / state.bpm // 每拍时长（秒）

  function scheduler() {
    const ctx = audio.ctx
    while (nextBeatTime < ctx.currentTime + LOOKAHEAD) {
      const beat = nextBeat
      const time = nextBeatTime
      // 每小节第一拍重音：底鼓（低音）；弱拍：踩镲（高音）
      if (beat === 0) audio.playDrum('kick', { time, velocity: 116 })
      else audio.playDrum('hihat', { time, velocity: 82 })
      // 视觉闪点按计划时刻触发
      const delay = Math.max(0, (time - ctx.currentTime) * 1000)
      setTimeout(() => flashBeat(beat), delay)
      nextBeatTime += beatDur()
      nextBeat = (nextBeat + 1) % state.beats
    }
  }

  function start() {
    const ctx = audio.unlock() // 必须先解锁：AudioContext 只能在用户手势后启动/恢复
    state.playing = true
    playBtn.textContent = '■ 停止'
    playBtn.classList.add('is-playing')
    nextBeat = 0
    nextBeatTime = ctx.currentTime + 0.08
    timer = setInterval(scheduler, TICK)
    scheduler()
  }

  function stop() {
    state.playing = false
    playBtn.textContent = '▶ 开始'
    playBtn.classList.remove('is-playing')
    clearInterval(timer)
    clearFlash()
  }

  playBtn.addEventListener('click', () => (state.playing ? stop() : start()))

  // ---- BPM 滑杆：播放中拖动即时生效（beatDur 每轮重算）----
  slider.addEventListener('input', () => {
    state.bpm = Number(slider.value)
    bpmLabel.querySelector('b').textContent = `${state.bpm} BPM`
  })

  // ---- 拍号 chips：2/3/4/6 拍 ----
  for (const beats of TIME_SIGS) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'chip metro-chip'
    b.textContent = `${beats} 拍`
    b.setAttribute('aria-label', `每小节 ${beats} 拍`)
    b.dataset.beats = String(beats)
    b.addEventListener('click', () => {
      state.beats = beats
      buildDots()
      nextBeat %= state.beats // 播放中换拍号：把走带拉回合法范围
      refreshChips()
    })
    chipsEl.appendChild(b)
  }

  function refreshChips() {
    chipsEl.querySelectorAll('.metro-chip').forEach((c) => {
      c.classList.toggle('is-active', Number(c.dataset.beats) === state.beats)
    })
  }

  buildDots()
  refreshChips()

  return {
    destroy() {
      stop()
    },
  }
}
