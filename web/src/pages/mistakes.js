// 错题本：按知识点分组列出错题（Rust 已分组排序），支持"重练本组"——
// 用 gen_question(topic) 为组内每条错题出同知识点的新题，答对自动移除该条。

import './daily.css' // 复用 .daily-done-badge/.daily-actions（Vite 同路径去重）
import './mistakes.css'
import { audio } from '../audio.js'
import { gen_question, check_answer } from '../wasm/xueyinyue-core.js'
import {
  TOPIC_META,
  topicLabel,
  renderQuestionCard,
  markMcResult,
  renderFeedback,
  recordAnswer,
} from './daily.js'
import * as progress from '../progress.js'

function resolveVar(name) {
  if (!name) return null
  if (name.startsWith('#')) return name
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function renderMistakes(main) {
  const components = []
  main.innerHTML = `
    <div class="mistakes-page">
      <a class="back-link" href="#/">← 首页</a>
      <h1 class="chapter-title">错题本</h1>
      <p class="chapter-notice">课程小练习与每日挑战里答错的题会自动收进来。重练答对即移出该条。</p>
      <div class="mistakes-body"></div>
    </div>`
  const body = main.querySelector('.mistakes-body')

  // ---------- 列表 ----------

  function renderList() {
    const groups = progress.getMistakesView()
    if (!groups.length) {
      body.innerHTML = `
        <section class="mistake-empty">
          <span class="finish-note">♪</span>
          <p>错题本空空如也，保持下去！</p>
          <p class="mistake-empty-sub">去<a href="#/chapters">课程</a>或<a href="#/daily">每日挑战</a>做几道小练习，答错的题会自动收进来。</p>
        </section>`
      return
    }
    body.innerHTML = ''
    for (const g of groups) body.appendChild(groupCard(g))
  }

  function groupCard(group) {
    const card = document.createElement('section')
    card.className = 'mistake-group'
    card.style.setProperty('--c', `var(${TOPIC_META[group.topic]?.colorVar ?? '--clay'})`)
    card.innerHTML = `
      <header class="mistake-group-head">
        <span class="mistake-chip">${topicLabel(group.topic)}</span>
        <span class="mistake-group-stat">${group.count} 条 · 累计错 ${group.totalWrong} 次</span>
        <button type="button" class="btn btn-primary btn-sm mistake-retry">重练本组</button>
      </header>
      <ul class="mistake-entries">${group.entries
        .map(
          (e) => `
        <li class="mistake-entry">
          <p class="mistake-entry-summary">${e.summary}</p>
          <p class="mistake-entry-meta">${e.date} · 已错 ${e.count} 次</p>
        </li>`
        )
        .join('')}</ul>`
    card.querySelector('.mistake-retry').addEventListener('click', () => startRetry(group))
    return card
  }

  // ---------- 重练本组 ----------

  // 组内每条错题配一道同知识点新题（队列固定在开始时快照）：
  // 答对 → solveMistake 移除对应那条；答错 → 该条保留（新错面由 recordAnswer 自动记录）。
  function startRetry(group) {
    const queue = group.entries.map((e) => e.id)
    const state = { idx: 0, solved: 0 }

    function progressLine() {
      return `
        <div class="mistake-retry-progress">
          <span class="mistake-chip">${topicLabel(group.topic)}</span>
          <span class="mistake-retry-count">重练 ${Math.min(state.idx + 1, queue.length)} / ${queue.length} · 已移出 ${state.solved} 条</span>
        </div>`
    }

    function next() {
      if (state.idx >= queue.length) return finish()
      const mistakeId = queue[state.idx]
      let q
      try {
        q = gen_question(group.topic)
      } catch (e) {
        body.innerHTML = `<p class="quiz-error">出题失败：${e.message || e}</p>`
        return
      }
      body.innerHTML = progressLine()
      const stage = document.createElement('div')
      stage.className = 'mistake-stage'
      body.appendChild(stage)

      const t0 = performance.now()
      renderQuestionCard(stage, q, {
        components,
        onAnswer(answer, els) {
          const responseMs = Math.round(performance.now() - t0)
          const result = check_answer(q, answer)
          if (q.kind === 'mc') markMcResult(els, q, result.correct)
          else {
            const correctMidis = q.answer.split(',').map(Number)
            const color = resolveVar(result.correct ? '--fa' : '--do')
            els.piano.setHighlights(correctMidis.map((m) => [m, color]))
            if (!result.correct) audio.playNotes(correctMidis, { duration: 2, velocity: 100, stagger: 0.25 })
          }
          if (result.correct) {
            progress.solveMistake(mistakeId) // 答对自动移除该条
            state.solved += 1
          }
          recordAnswer(q, result, responseMs)
          const last = state.idx + 1 >= queue.length
          renderFeedback(stage, result, {
            nextLabel: last ? '完成重练 →' : '下一题 →',
            onNext: () => {
              state.idx += 1
              next()
            },
          })
        },
      })
    }

    function finish() {
      const remaining = progress.getMistakesView().find((g) => g.topic === group.topic)?.count ?? 0
      body.innerHTML = `
        <section class="mistake-group is-done">
          <p class="daily-done-badge" style="--c: var(--fa)">✓ 本组重练完成</p>
          <p class="mistake-done-line">答对 ${state.solved} / ${queue.length} 题，移出 ${state.solved} 条错题。</p>
          <p class="mistake-done-sub">${
            remaining
              ? `该知识点还剩 ${remaining} 条，再接再厉。`
              : '这个知识点已经清空，漂亮！'
          }</p>
          <div class="daily-actions">
            <button type="button" class="btn btn-primary mistake-back">返回错题本</button>
            <a class="btn btn-ghost" href="#/daily">去每日挑战 →</a>
          </div>
        </section>`
      body.querySelector('.mistake-back').addEventListener('click', renderList)
    }

    next()
  }

  renderList()

  return {
    destroy() {
      components.forEach((c) => c.destroy?.())
    },
  }
}
