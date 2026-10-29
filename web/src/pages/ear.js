// 练耳训练场：调性级数（Functional）模式 + 音程听辨 + 和弦性质等六模式。
// 出题与判分全部在 Rust；这里只负责播放与收集作答（含反应时间）。
// 设置面板（音量 / 节奏速度 / 调性）存 localStorage['xyy:ear-settings']，刷新后保留：
//   音量 → 播放 velocity 等比缩放（0 = 完全不排音，真静音）；
//   节奏 → 音符间隔倍率 0.5x–2x（0.5 紧凑、2 舒缓），playQuestion 全部时值随之缩放；
//   调性 → 仅「调性级数」模式生效，走 wasm 的 gen_question_in_key 按所选大调出
//          cadence 与目标音（C/G/F/Bb），解释文案由 Rust 报真实调性。

import './ear.css'
import { audio } from '../audio.js'
import { gen_question, gen_question_in_key, check_answer } from '../wasm/xueyinyue-core.js'
import * as progress from '../progress.js'

const MODES = [
  { id: 'tonal-ear', name: '调性级数', desc: '先听和声建立调中心，再听单音答唱名', colorVar: '--si' },
  { id: 'interval-ear', name: '音程听辨', desc: '两个音，答音程名称', colorVar: '--fa' },
  { id: 'chord-ear', name: '和弦听辨', desc: '一个和弦，答大/小/增/减', colorVar: '--sol' },
  { id: 'key-mode', name: '大小调听辨', desc: '一条旋律片段，答大调还是小调', colorVar: '--do' },
  { id: 'progression-ear', name: '进行听辨', desc: '两个和弦的进行，四选一', colorVar: '--re' },
  { id: 'melody-ear', name: '旋律听辨', desc: '三个音的短句，选出简谱', colorVar: '--mi' },
]

// ---------- 设置（持久化到 localStorage） ----------

const SETTINGS_KEY = 'xyy:ear-settings'
const TONIC_POOL = ['C', 'G', 'F', 'Bb']
const SETTING_DEFAULTS = { volume: 80, tempo: 1, key: 'C' }

/** 读取设置：越界/非法值一律回退默认（防手改 localStorage 弄坏页面）。 */
function loadEarSettings() {
  const num = (v, lo, hi, def) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return def
    return Math.min(hi, Math.max(lo, n))
  }
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    return {
      volume: num(s.volume, 0, 100, SETTING_DEFAULTS.volume),
      tempo: num(s.tempo, 0.5, 2, SETTING_DEFAULTS.tempo),
      key: TONIC_POOL.includes(s.key) ? s.key : SETTING_DEFAULTS.key,
    }
  } catch {
    return { ...SETTING_DEFAULTS }
  }
}

export function renderEar(main) {
  let mode = MODES[0]
  let session = { total: 0, correct: 0 }
  let t0 = 0
  const settings = loadEarSettings()

  main.innerHTML = `
    <div class="ear-page">
      <a class="back-link" href="#/">← 首页</a>
      <h1 class="chapter-title">练耳训练场</h1>
      <p class="chapter-notice">耳朵是练出来的：每天 10 分钟，比一次练两小时更有效。</p>
      <div class="ear-tabs" role="tablist"></div>
      <div class="ear-settings" role="group" aria-label="练耳设置">
        <label class="ear-setting">
          <span class="ear-setting-name">音量</span>
          <input type="range" class="ear-range" data-setting="volume" min="0" max="100" step="1" value="${settings.volume}" />
          <output class="ear-setting-val" data-val="volume">${settings.volume}</output>
        </label>
        <label class="ear-setting" title="音符间隔倍率：越小越紧凑，越大越舒缓">
          <span class="ear-setting-name">节奏</span>
          <input type="range" class="ear-range" data-setting="tempo" min="0.5" max="2" step="0.1" value="${settings.tempo}" />
          <output class="ear-setting-val" data-val="tempo">${settings.tempo.toFixed(1)}x</output>
        </label>
        <label class="ear-setting" title="仅「调性级数」模式生效：cadence 与目标音按所选大调出题">
          <span class="ear-setting-name">调性</span>
          <select class="ear-key" data-setting="key" aria-label="调性（调性级数模式）">
            ${TONIC_POOL.map(
              (k) => `<option value="${k}"${k === settings.key ? ' selected' : ''}>${k} 大调</option>`
            ).join('')}
          </select>
        </label>
      </div>
      <div class="ear-session"></div>
      <div class="ear-stage"></div>
    </div>
  `
  const tabsEl = main.querySelector('.ear-tabs')
  const settingsEl = main.querySelector('.ear-settings')
  const sessionEl = main.querySelector('.ear-session')
  const stageEl = main.querySelector('.ear-stage')

  for (const m of MODES) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'ear-tab'
    b.style.setProperty('--tab', `var(${m.colorVar})`)
    b.innerHTML = `<b>${m.name}</b><span>${m.desc}</span>`
    b.addEventListener('click', () => {
      mode = m
      session = { total: 0, correct: 0 }
      refreshTabs()
      nextQuestion()
    })
    b.dataset.mode = m.id
    tabsEl.appendChild(b)
  }

  function refreshTabs() {
    tabsEl.querySelectorAll('.ear-tab').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.mode === mode.id)
    })
  }

  function saveEarSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      /* 隐私模式等写不进就算了：设置只在本次会话生效 */
    }
  }

  // 滑杆拖动（input 高频触发）：更新数值 + 存盘，下次播放立即生效
  settingsEl.addEventListener('input', (e) => {
    const el = e.target
    if (el.dataset.setting === 'volume') {
      settings.volume = Number(el.value)
      settingsEl.querySelector('[data-val="volume"]').value = String(settings.volume)
    } else if (el.dataset.setting === 'tempo') {
      settings.tempo = Number(el.value)
      settingsEl.querySelector('[data-val="tempo"]').value = `${settings.tempo.toFixed(1)}x`
    } else {
      return
    }
    saveEarSettings()
  })

  // 调性切换：调性级数模式立即换一道新调的题；其他模式不受调性影响
  settingsEl.addEventListener('change', (e) => {
    if (e.target.dataset.setting !== 'key') return
    settings.key = e.target.value
    saveEarSettings()
    if (mode.id === 'tonal-ear') nextQuestion()
  })

  function renderSession() {
    const dash = progress.getDashboard()
    const pct = session.total ? Math.round((session.correct / session.total) * 100) : 0
    sessionEl.innerHTML = `
      <div class="ear-stats">
        <span>本组 ${session.correct}/${session.total}${session.total ? `（${pct}%）` : ''}</span>
        <span>今日 ${dash.todayCount}/${dash.dailyGoal} 题</span>
        <span>连续 ${dash.streakDays} 天</span>
      </div>`
  }

  /**
   * 在指定时间点播放一组音（audio.playNotes 不支持 time，这里逐音排程）。
   * 音量设置在这里按 velocity 等比缩放，0 时直接不排（合成兜底的音量下限挡不住静音）；
   * 时间点/时值/错开量由调用方按节奏倍率算好传入，本函数不做时间缩放。
   */
  function playAt(midis, when, { duration = 1.5, velocity = 100, stagger = 0 } = {}) {
    const vel = Math.round((velocity * settings.volume) / 100)
    if (vel <= 0) return
    midis.forEach((m, i) => audio.playNote(m, { duration, velocity: vel, time: when + i * stagger }))
  }

  function playQuestion(q) {
    const ctx = audio.unlock()
    const t0 = ctx.currentTime + 0.06
    const mult = settings.tempo // 音符间隔倍率：0.5 紧凑 … 2 舒缓（时值同倍率缩放，保持乐感）
    const beat = 0.62 * mult
    // 进行听辨：两个和弦先后响起，第二个稍长收尾
    if (q.playMode === 'progression' && q.cadence?.length >= 2) {
      playAt(q.cadence[0], t0, { duration: 1.1 * mult, velocity: 100 })
      playAt(q.cadence[1], t0 + 1.15 * mult, { duration: 1.9 * mult, velocity: 104 })
      return t0
    }
    // 调性模式：I–IV–V–I 依次和弦 → 目标音
    if (q.cadence?.length) {
      q.cadence.forEach((chord, i) => playAt(chord, t0 + i * beat, { duration: beat * 0.95, velocity: 92 }))
      const targetAt = t0 + q.cadence.length * beat + 0.35 * mult
      if (q.playMode === 'chord') playAt(q.play, targetAt, { duration: 2.4 * mult, velocity: 104 })
      else playAt(q.play, targetAt, { duration: 1.5 * mult, velocity: 104 })
      return targetAt
    }
    // 其余：和弦同时响，旋律依次响
    if (q.playMode === 'chord') {
      playAt(q.play, t0, { duration: 2.4 * mult, velocity: 104 })
    } else {
      playAt(q.play, t0, { duration: 1.5 * mult, velocity: 104, stagger: 0.55 * mult })
    }
    return t0
  }

  function nextQuestion() {
    renderSession()
    let q
    try {
      // 调性级数按所选调出题（cadence + 目标音都在该大调内）；其余题型无调性参数
      q = mode.id === 'tonal-ear' ? gen_question_in_key('tonal-ear', settings.key) : gen_question(mode.id)
    } catch (e) {
      stageEl.innerHTML = `<p class="quiz-error">出题失败：${e.message || e}</p>`
      return
    }
    t0 = performance.now()

    stageEl.innerHTML = `
      <p class="quiz-prompt">${q.prompt}</p>
      ${q.subPrompt ? `<p class="quiz-subprompt">${q.subPrompt}</p>` : ''}
      <div class="quiz-playbar"><button type="button" class="btn btn-ghost ear-replay">🔊 再听一遍</button></div>
      <div class="option-grid ear-options"></div>
      <div class="ear-feedback"></div>`

    stageEl.querySelector('.ear-replay').addEventListener('click', () => {
      t0 = performance.now()
      playQuestion(q)
    })

    const grid = stageEl.querySelector('.ear-options')
    let answered = false
    for (const opt of q.options) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'option-btn'
      b.textContent = opt.label
      // 唱名选项着唱名色
      const solfegeIdx = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'].indexOf(opt.label)
      if (solfegeIdx >= 0) {
        b.style.setProperty('--dg', `var(${['--do', '--re', '--mi', '--fa', '--sol', '--la', '--si'][solfegeIdx]})`)
        b.classList.add('is-solfege')
      }
      b.addEventListener('click', () => {
        if (answered) return
        answered = true
        const responseMs = Math.round(performance.now() - t0)
        const result = check_answer(q, opt.key)
        session.total += 1
        if (result.correct) session.correct += 1
        progress.record(q.topic, result.correct, responseMs)
        if (result.correct) b.classList.add('is-right')
        else {
          b.classList.add('is-wrong')
          grid.querySelectorAll('.option-btn').forEach((x) => {
            if (x.textContent === q.options.find((o) => o.key === q.answer).label) x.classList.add('is-right')
          })
        }
        const fb = stageEl.querySelector('.ear-feedback')
        fb.innerHTML = `
          <div class="quiz-feedback ${result.correct ? 'is-correct' : 'is-wrong'}">
            <p class="fb-line">${result.correct ? '答对了！' : `正确答案：${result.answerLabel}`}</p>
            <p class="fb-exp">${result.explanation}</p>
            <button type="button" class="btn btn-primary ear-next">下一题 →</button>
          </div>`
        fb.querySelector('.ear-next').addEventListener('click', nextQuestion)
        // 旋律听辨：答对后重播一遍原句，确认听感
        if (result.correct && mode.id === 'melody-ear') setTimeout(() => playQuestion(q), 450)
        renderSession()
      })
      grid.appendChild(b)
    }

    // 自动播放（playQuestion 内部会 unlock 音频引擎）
    playQuestion(q)
  }

  refreshTabs()
  nextQuestion()

  return { destroy() {} }
}
