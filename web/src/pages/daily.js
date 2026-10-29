// 每日挑战：每天一组 10 题跨知识点混合测试。
// 题型池由 Rust（progress_daily_status → pool）依据已学章节给出；
// 出题/判分全部走 wasm 的 gen_question / check_answer，这里只做呈现、发声与收集作答。

import './daily.css'
import { audio } from '../audio.js'
import { gen_question, check_answer } from '../wasm/xueyinyue-core.js'
import { renderStaff } from '../staff.js'
import { createPiano } from '../piano.js'
import * as progress from '../progress.js'

export const DAILY_TOTAL = 10

/** 知识点中文名与分组色（错题本页共用）。 */
export const TOPIC_META = {
  'note-name': { label: '音名辨认', colorVar: '--do' },
  'jianpu-digit': { label: '简谱数字', colorVar: '--re' },
  'build-scale': { label: '构建音阶', colorVar: '--mi' },
  'interval-see': { label: '音程·看谱', colorVar: '--fa' },
  'interval-ear': { label: '音程·听辨', colorVar: '--sol' },
  'chord-see': { label: '和弦·看谱', colorVar: '--la' },
  'chord-ear': { label: '和弦·听辨', colorVar: '--si' },
  'build-chord': { label: '构建和弦', colorVar: '--do' },
  'tonal-ear': { label: '调性级数', colorVar: '--sol' },
}

export function topicLabel(kind) {
  return TOPIC_META[kind]?.label ?? kind
}

function resolveVar(name) {
  if (!name) return null
  if (name.startsWith('#')) return name
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// ============ 题目呈现（错题本重练共用） ============

/** 在指定时间点播放一组音（audio.playNotes 不支持 time，这里逐音排程）。 */
function playAt(midis, when, { duration = 1.8, velocity = 100, stagger = 0 } = {}) {
  midis.forEach((m, i) => audio.playNote(m, { duration, velocity, time: when + i * stagger }))
}

/** 按题型播放题目音频：调性级数先播 I–IV–V–I 建调，其余播 play 序列。 */
export function playQuestionAudio(q) {
  const ctx = audio.unlock()
  if (!ctx) return
  const t0 = ctx.currentTime + 0.06
  const beat = 0.62
  if (q.cadence && q.cadence.length) {
    q.cadence.forEach((chord, i) => playAt(chord, t0 + i * beat, { duration: beat * 0.95, velocity: 92 }))
    playAt(q.play, t0 + q.cadence.length * beat + 0.35, { duration: 1.5, velocity: 104 })
    return
  }
  if (!q.play || !q.play.length) return
  if (q.playMode === 'chord') {
    playAt(q.play, t0, { duration: 2.4, velocity: 104 })
  } else {
    // 旋律：依次弹一遍，稍作停顿再整组重播一次，方便跟唱比对
    playAt(q.play, t0, { duration: 1.5, velocity: 104, stagger: 0.55 })
    playAt(q.play, t0 + q.play.length * 0.55 + 0.25, { duration: 2.2, velocity: 92 })
  }
}

/** 选择题标色：答对亮绿，答错标红并点出正确项。 */
export function markMcResult(els, q, correct) {
  if (!els?.grid) return
  if (correct) {
    els.btn?.classList.add('is-right')
  } else {
    els.btn?.classList.add('is-wrong')
    const correctLabel = q.options?.find((o) => o.key === q.answer)?.label
    els.grid.querySelectorAll('.option-btn').forEach((b) => {
      if (b.textContent === correctLabel) b.classList.add('is-right')
    })
  }
}

/** 记录作答：走 Rust 更新掌握度/每日目标；答错自动收进错题本。 */
export function recordAnswer(q, result, responseMs) {
  progress.record(q.topic, result.correct, responseMs)
  if (!result.correct) {
    // 题面摘要带上正确答案，同题面再错只累计次数
    progress.recordMistake(q.topic, `${q.prompt}（正确答案：${result.answerLabel}）`)
  }
  return result.correct
}

/** 反馈条（答对绿/答错红 + 下一题），滚动到反馈位置。 */
export function renderFeedback(stage, result, { nextLabel = '下一题 →', onNext } = {}) {
  const fb = document.createElement('div')
  fb.className = `quiz-feedback ${result.correct ? 'is-correct' : 'is-wrong'}`
  fb.innerHTML = `
    <p class="fb-line">${result.correct ? '答对了！' : `不对哦，正确答案：${result.answerLabel}`}</p>
    <p class="fb-exp">${result.explanation}</p>`
  const next = document.createElement('button')
  next.type = 'button'
  next.className = 'btn btn-primary'
  next.textContent = nextLabel
  next.addEventListener('click', onNext)
  fb.appendChild(next)
  stage.appendChild(fb)
  const fbY = fb.getBoundingClientRect().top + window.scrollY - 120
  window.scrollTo(0, Math.max(0, fbY))
}

/**
 * 渲染一道题（题面/谱面/播放条 + 选择题或琴键构建）。
 * onAnswer(answer, els)：mc 的 answer 是选项 key（els={btn,grid}），
 * build 的是升序 midi 逗号串（els={piano}）。判分与后续反馈由调用方处理。
 */
export function renderQuestionCard(stage, q, { onAnswer, components = [] } = {}) {
  stage.innerHTML = ''
  const head = document.createElement('div')
  head.className = 'quiz-head'
  head.innerHTML = `<p class="quiz-prompt">${q.prompt}</p>`
  if (q.subPrompt) head.innerHTML += `<p class="quiz-subprompt">${q.subPrompt}</p>`
  stage.appendChild(head)

  if (q.staffNotes && q.staffNotes.length) {
    const st = document.createElement('div')
    st.className = 'quiz-staff'
    stage.appendChild(st)
    renderStaff(st, q.staffNotes.map((key) => ({ key })), {})
  }

  const hasAudio = (q.play && q.play.length) || (q.cadence && q.cadence.length)
  if (hasAudio) {
    const bar = document.createElement('div')
    bar.className = 'quiz-playbar'
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'btn btn-ghost'
    btn.textContent = q.cadence?.length
      ? '🔊 重播和声 + 目标音'
      : q.playMode === 'chord'
        ? '🔊 播放和弦'
        : '🔊 播放'
    btn.addEventListener('click', () => playQuestionAudio(q))
    bar.appendChild(btn)
    stage.appendChild(bar)
  }

  if (q.kind === 'mc') {
    renderMc(stage, q, onAnswer)
  } else {
    renderBuild(stage, q, onAnswer, components)
  }

  // 自动播放一次（页面入口都是点击手势之后，AudioContext 已解锁）
  if (hasAudio) playQuestionAudio(q)
}

const SOLFEGE_VARS = ['--do', '--re', '--mi', '--fa', '--sol', '--la', '--si']

function renderMc(stage, q, onAnswer) {
  const grid = document.createElement('div')
  grid.className = 'option-grid'
  let answered = false
  for (const opt of q.options) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'option-btn'
    b.textContent = opt.label
    // 唱名选项着唱名色
    const idx = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'].indexOf(opt.label)
    if (idx >= 0) {
      b.style.setProperty('--dg', `var(${SOLFEGE_VARS[idx]})`)
      b.classList.add('is-solfege')
    }
    b.addEventListener('click', () => {
      if (answered) return
      answered = true
      onAnswer(opt.key, { btn: b, grid })
    })
    grid.appendChild(b)
  }
  stage.appendChild(grid)
}

function renderBuild(stage, q, onAnswer, components) {
  const mount = document.createElement('div')
  mount.className = 'quiz-build'
  stage.appendChild(mount)
  const selected = new Set()
  const piano = createPiano(mount, {
    startMidi: 55,
    octaves: 2,
    keyboard: false,
    onNote(midi) {
      if (selected.has(midi)) selected.delete(midi)
      else selected.add(midi)
      piano.setHighlights([...selected].map((m) => [m, resolveVar('--clay')]))
    },
  })
  components.push(piano)

  const bar = document.createElement('div')
  bar.className = 'quiz-playbar'
  const submit = document.createElement('button')
  submit.type = 'button'
  submit.className = 'btn btn-primary'
  submit.textContent = '检查'
  submit.addEventListener('click', () => {
    submit.disabled = true // 防止重复判分
    const answer = [...selected].sort((a, b) => a - b).join(',')
    onAnswer(answer, { piano })
  })
  bar.appendChild(submit)
  stage.appendChild(bar)
}

// ============ 页面 ============

export function renderDaily(main) {
  const components = []
  main.innerHTML = `
    <div class="daily-page">
      <a class="back-link" href="#/">← 首页</a>
      <h1 class="chapter-title">每日挑战</h1>
      <p class="chapter-notice">每天一组 10 题混合测试，全部来自你学过的章节。答错的题会自动收进错题本。</p>
      <div class="daily-body"></div>
    </div>`
  const body = main.querySelector('.daily-body')

  function poolChips(pool) {
    return pool
      .map(
        (k) =>
          `<span class="daily-pool-chip" style="--c: var(${TOPIC_META[k]?.colorVar ?? '--clay'})">${topicLabel(k)}</span>`
      )
      .join('')
  }

  function doneCard(status, { withTable = false, perTopic = null } = {}) {
    const pct = status.total ? Math.round((status.correct / status.total) * 100) : 0
    const rows = perTopic
      ? [...perTopic.entries()]
          .map(
            ([k, [c, t]]) => `
        <div class="daily-topic-row">
          <span class="daily-pool-chip" style="--c: var(${TOPIC_META[k]?.colorVar ?? '--clay'})">${topicLabel(k)}</span>
          <span>${c} / ${t}</span>
        </div>`
          )
          .join('')
      : ''
    return `
      <p class="daily-done-badge" style="--c: var(--fa)">✓ 今日挑战已完成</p>
      <p class="daily-score"><b>${status.correct}</b><i> / ${status.total} 题（${pct}%）</i></p>
      <p class="daily-summary">${status.summary}</p>
      ${withTable ? `<div class="daily-topic-table">${rows}</div>` : ''}
      <div class="daily-actions">
        <button type="button" class="btn btn-primary daily-again">再挑战一次（取最好成绩）</button>
        <a class="btn btn-ghost" href="#/mistakes">去错题本 →</a>
        <a class="btn btn-ghost" href="#/">返回首页</a>
      </div>`
  }

  function renderIdle() {
    const status = progress.getDailyStatus()
    body.innerHTML = `
      <section class="daily-hero">
        ${
          status.done
            ? doneCard(status)
            : `
        <p class="daily-hero-line">今天的题目池：<span class="daily-pool">${poolChips(status.pool)}</span></p>
        <p class="daily-hero-sub">共 ${DAILY_TOTAL} 题，答完即记入进度；同一天多次挑战取最好成绩。</p>
        <button type="button" class="btn btn-primary daily-start">开始挑战 →</button>`
        }
      </section>`
    body.querySelector('.daily-start')?.addEventListener('click', startChallenge)
    body.querySelector('.daily-again')?.addEventListener('click', startChallenge)
  }

  // 轮流覆盖各题型，再整体洗牌，保证 10 题尽量雨露均沾又不按套路出牌
  function buildPlan(pool) {
    const plan = []
    for (let i = 0; i < DAILY_TOTAL; i++) plan.push(pool[i % pool.length])
    for (let i = plan.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[plan[i], plan[j]] = [plan[j], plan[i]]
    }
    return plan
  }

  function renderProgress(session, plan) {
    return `
      <div class="daily-progress">
        <div class="daily-dots">${plan
          .map((_, i) => {
            if (i < session.marks.length) return `<span class="daily-dot ${session.marks[i] ? 'is-correct' : 'is-wrong'}"></span>`
            if (i === session.marks.length) return '<span class="daily-dot is-current"></span>'
            return '<span class="daily-dot"></span>'
          })
          .join('')}</div>
        <span class="daily-count">${Math.min(session.marks.length + 1, plan.length)} / ${plan.length}</span>
        <span class="daily-hit">答对 ${session.correct}</span>
      </div>`
  }

  function startChallenge() {
    const pool = progress.getDailyStatus().pool
    const plan = buildPlan(pool)
    const session = { correct: 0, marks: [], perTopic: new Map() }

    function trackTopic(q, correct) {
      const [c, t] = session.perTopic.get(q.topic) ?? [0, 0]
      session.perTopic.set(q.topic, [c + (correct ? 1 : 0), t + 1])
    }

    function next() {
      if (session.marks.length >= plan.length) return finish()
      const kind = plan[session.marks.length]
      let q
      try {
        q = gen_question(kind)
      } catch (e) {
        body.innerHTML = `<p class="quiz-error">出题失败：${e.message || e}</p>`
        return
      }
      body.innerHTML = renderProgress(session, plan)
      const stage = document.createElement('div')
      stage.className = 'daily-stage'
      body.appendChild(stage)

      const t0 = performance.now()
      renderQuestionCard(stage, q, {
        components,
        onAnswer(answer, els) {
          const responseMs = Math.round(performance.now() - t0)
          const result = check_answer(q, answer)
          if (q.kind === 'mc') markMcResult(els, q, result.correct)
          else {
            // 构建题：标出正确键位（绿=答对 / 红=答错示范），示范音用正确答案的键
            const correctMidis = q.answer.split(',').map(Number)
            const color = resolveVar(result.correct ? '--fa' : '--do')
            els.piano.setHighlights(correctMidis.map((m) => [m, color]))
            if (!result.correct) audio.playNotes(correctMidis, { duration: 2, velocity: 100, stagger: 0.25 })
          }
          session.marks.push(result.correct)
          if (result.correct) session.correct += 1
          trackTopic(q, result.correct)
          recordAnswer(q, result, responseMs)
          const last = session.marks.length >= plan.length
          renderFeedback(stage, result, {
            nextLabel: last ? '查看小结 →' : '下一题 →',
            onNext: next,
          })
        },
      })
    }

    function finish() {
      progress.recordDailyResult(session.correct, plan.length)
      const status = progress.getDailyStatus()
      const pct = status.total ? Math.round((status.correct / status.total) * 100) : 0
      body.innerHTML = `
        <section class="daily-hero">
          ${doneCard(status, { withTable: true, perTopic: session.perTopic })}
        </section>`
      body.querySelector('.daily-again')?.addEventListener('click', startChallenge)
    }

    next()
  }

  renderIdle()

  return {
    destroy() {
      components.forEach((c) => c.destroy?.())
    },
  }
}
