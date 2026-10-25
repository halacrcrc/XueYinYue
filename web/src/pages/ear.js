// 练耳训练场：调性级数（Functional）模式 + 音程听辨 + 和弦性质。
// 出题与判分全部在 Rust；这里只负责播放与收集作答（含反应时间）。

import { audio } from '../audio.js'
import { gen_question, check_answer } from '../wasm/xueyinyue-core.js'
import * as progress from '../progress.js'

const MODES = [
  { id: 'tonal-ear', name: '调性级数', desc: '先听和声建立调中心，再听单音答唱名', colorVar: '--si' },
  { id: 'interval-ear', name: '音程听辨', desc: '两个音，答音程名称', colorVar: '--fa' },
  { id: 'chord-ear', name: '和弦听辨', desc: '一个和弦，答大/小/增/减', colorVar: '--sol' },
]

export function renderEar(main) {
  let mode = MODES[0]
  let session = { total: 0, correct: 0 }
  let t0 = 0

  main.innerHTML = `
    <div class="ear-page">
      <a class="back-link" href="#/">← 首页</a>
      <h1 class="chapter-title">练耳训练场</h1>
      <p class="chapter-notice">耳朵是练出来的：每天 10 分钟，比一次练两小时更有效。</p>
      <div class="ear-tabs" role="tablist"></div>
      <div class="ear-session"></div>
      <div class="ear-stage"></div>
    </div>
  `
  const tabsEl = main.querySelector('.ear-tabs')
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

  function playQuestion(q) {
    // 调性模式：I–IV–V–I 依次和弦 → 目标音
    const beat = 0.62
    q.cadence.forEach((chord, i) => {
      audio.playNotes(chord, { duration: beat * 0.95, velocity: 92, time: audio.ctx.currentTime + 0.05 + i * beat })
    })
    const targetAt = audio.ctx.currentTime + 0.05 + q.cadence.length * beat + 0.35
    if (q.playMode === 'chord') {
      audio.playNotes(q.play, { duration: 2.4, velocity: 104, time: targetAt })
    } else {
      audio.playNotes(q.play, { duration: 1.5, velocity: 104, time: targetAt })
    }
    return targetAt
  }

  function nextQuestion() {
    renderSession()
    let q
    try {
      q = gen_question(mode.id)
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
        renderSession()
      })
      grid.appendChild(b)
    }

    // 自动播放（等待引擎可用即用户已交互过）
    const ready = () => playQuestion(q)
    audio.ctx ? ready() : audio.unlock() && ready()
  }

  refreshTabs()
  nextQuestion()

  return { destroy() {} }
}
