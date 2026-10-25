// 跟打练习：先给 4 拍预备点击，然后按节拍点击 8 拍；
// 学习者跟着点"拍点"，测每次的时间误差，给出准确度评分。

import { audio } from './audio.js'

export function createTapTrainer(el, { bpm = 90, beats = 8 } = {}) {
  el.classList.add('tap-trainer')
  let running = false
  let beatTimes = []
  let taps = []
  const results = new Array(beats).fill(null)

  el.innerHTML = `
    <div class="tap-stage" role="button" tabindex="0" aria-label="点击或按空格跟打节拍">
      <p class="tap-hint">准备好了就点下面开始 → 听到"嘀嘀嘀嘀"预备后，跟着点击拍点</p>
      <div class="tap-dots"></div>
      <div class="tap-result"></div>
    </div>
    <div class="tap-actions">
      <button type="button" class="btn btn-primary tap-start">开始跟打</button>
      <label class="seq-bpm tap-bpm"><span>速度</span><input type="range" min="60" max="140" value="${bpm}" step="5" /><b>${bpm} BPM</b></label>
    </div>
  `

  const stage = el.querySelector('.tap-stage')
  const dotsEl = el.querySelector('.tap-dots')
  const resultEl = el.querySelector('.tap-result')
  const startBtn = el.querySelector('.tap-start')
  const sliderEl = el.querySelector('.tap-bpm input')
  let bpmNow = bpm

  const renderDots = () => {
    dotsEl.innerHTML = results
      .map((r, i) => {
        const cls = r === null ? '' : r <= 0.08 ? 'is-perfect' : r <= 0.16 ? 'is-good' : 'is-miss'
        return `<span class="tap-dot ${cls}"></span>`
      })
      .join('')
  }
  renderDots()

  function start() {
    const ctx = audio.unlock()
    running = true
    taps = []
    results.fill(null)
    renderDots()
    resultEl.innerHTML = ''
    startBtn.disabled = true
    const beat = 60 / bpmNow
    const countIn = 4
    const t0 = ctx.currentTime + 0.6
    beatTimes = []
    for (let i = 0; i < countIn + beats; i++) {
      const t = t0 + i * beat
      // 预备拍用踩镲，正式拍用更响的军鼓边击感（hihat 提示 + kick 打点）
      audio.playDrum(i < countIn ? 'hihat' : 'kick', { time: t, velocity: i < countIn ? 80 : 96 })
      if (i >= countIn) beatTimes.push(t)
    }
    // 预备期视觉提示
    stage.classList.add('is-countin')
    setTimeout(() => stage.classList.remove('is-countin'), (t0 - ctx.currentTime + countIn * beat) * 1000)
    // 结束收卷
    const endAt = (t0 - ctx.currentTime + (countIn + beats) * beat) * 1000 + 250
    setTimeout(() => finish(), endAt)
  }

  function registerTap() {
    if (!running || !audio.ctx) return
    const t = audio.ctx.currentTime
    // 找最近未被命中的拍点
    let bestIdx = -1
    let bestDt = Infinity
    beatTimes.forEach((bt, i) => {
      if (results[i] !== null) return
      const dt = Math.abs(t - bt)
      if (dt < bestDt) {
        bestDt = dt
        bestIdx = i
      }
    })
    if (bestIdx >= 0 && bestDt < 0.5) {
      results[bestIdx] = bestDt
      stage.classList.add('is-tapped')
      setTimeout(() => stage.classList.remove('is-tapped'), 120)
    }
    renderDots()
  }

  function finish() {
    running = false
    startBtn.disabled = false
    const done = results.filter((r) => r !== null)
    if (!done.length) {
      resultEl.innerHTML = '<p class="tap-verdict">没接上拍点，再来一次？</p>'
      return
    }
    const perfect = results.filter((r) => r !== null && r <= 0.08).length
    const good = results.filter((r) => r !== null && r > 0.08 && r <= 0.16).length
    const avg = (done.reduce((a, b) => a + b, 0) / done.length * 1000).toFixed(0)
    const score = Math.round((perfect + good * 0.6) / beats * 100)
    const verdict =
      score >= 90 ? '稳如节拍器！' : score >= 70 ? '很有节奏感！' : score >= 45 ? '找到感觉了，再练一遍会更稳' : '先跟着拍点点头、拍手，感受"脉搏"再来'
    resultEl.innerHTML = `
      <p class="tap-verdict"><b>${score} 分</b> · 平均误差 ${avg} 毫秒 · 精准 ${perfect} 拍 / 良好 ${good} 拍</p>
      <p class="tap-note">${verdict}</p>`
  }

  startBtn.addEventListener('click', start)
  stage.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    if (running) registerTap()
    else start()
  })
  stage.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      if (running) registerTap()
      else start()
    }
  })
  sliderEl.addEventListener('input', () => {
    bpmNow = Number(sliderEl.value)
    el.querySelector('.tap-bpm b').textContent = `${bpmNow} BPM`
  })

  return { el, destroy() { el.innerHTML = '' } }
}
