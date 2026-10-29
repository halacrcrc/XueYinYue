// 课程目录：全部章节一览 + 进度 + 特别入口（练耳训练场 / 音乐乐园 / 每日挑战 / 错题本 / 查询器 / 节拍器）

import { CHAPTERS } from '../dashboard.js'
import * as progress from '../progress.js'
import { ch1 } from '../content/ch1.js'
import { ch2 } from '../content/ch2.js'
import { ch3 } from '../content/ch3.js'
import { ch4 } from '../content/ch4.js'
import { ch5 } from '../content/ch5.js'
import { ch6 } from '../content/ch6.js'
import { ch7 } from '../content/ch7.js'
import { ch8 } from '../content/ch8.js'
import { ch9 } from '../content/ch9.js'
import { ch10 } from '../content/ch10.js'

const CONTENT = { ch1, ch2, ch3, ch4, ch5, ch6, ch7, ch8, ch9, ch10 }

const DESCRIPTIONS = {
  ch1: '声音是振动、钢琴的地图、七个音名、唱名与简谱',
  ch2: '拍与 BPM、时值、步进音序器、跟打评分',
  ch3: '五声先行、半音全音、大小调公式、移调',
  ch4: '度数与半音、协和与不协和（波形可视化）',
  ch5: '三和弦的大/小/增/减，听辨 + 亲手搭',
  ch6: '级数思维、经典进行、移调实验室',
  ch7: '五度圈、调号与近关系调转调',
  ch8: '动机与模进、乐句问答、给 1–5–6–4 写旋律',
}

export function renderChapters(main) {
  const dash = progress.getDashboard()
  // 练习组实时状态：每日挑战今日完成态 / 错题本待重练条数
  const daily = progress.getDailyStatus()
  const mistakesTotal = progress
    .getMistakesView()
    .reduce((sum, g) => sum + (g.count || 0), 0)

  const cards = CHAPTERS.map((ch, idx) => {
    if (ch.id === 'ear') {
      return `
        <a class="chapter-card" href="#/ear" style="--cc: var(${ch.colorVar})">
          <div class="cc-badge" style="--cc: var(${ch.colorVar})">${ch.label}</div>
          <h2 class="cc-title">${ch.title}</h2>
          <p class="cc-desc">调性级数 / 音程 / 和弦，每天十分钟</p>
          <span class="cc-action">去训练 →</span>
        </a>`
    }
    const def = CONTENT[ch.id]
    const total = def?.lessons.length ?? 0
    const done = dash.chapterCounts[ch.id] ?? 0
    const pct = total ? Math.round((done / total) * 100) : 0
    return `
      <a class="chapter-card" href="${ch.href}" style="--cc: var(${ch.colorVar})">
        <div class="cc-badge" style="--cc: var(${ch.colorVar})">${ch.label}</div>
        <h2 class="cc-title">${ch.title}</h2>
        <p class="cc-desc">${DESCRIPTIONS[ch.id] || ''}</p>
        <div class="cc-progress">
          <div class="cc-bar"><i style="width: ${pct}%"></i></div>
          <span>${total ? `${done}/${total} 课` : ''}</span>
        </div>
        <span class="cc-action">${done === 0 ? '开始学习' : pct >= 100 ? '再刷一遍' : '继续'} →</span>
      </a>`
  }).join('')

  main.innerHTML = `
    <div class="chapters-page">
      <a class="back-link" href="#/">← 首页</a>
      <h1 class="chapter-title">课程目录</h1>
      <p class="chapter-notice">建议按顺序学；任何疑问都能随时回到前面的章节复习。</p>
      <div class="chapters-grid">
        ${cards}
        <a class="chapter-card is-fun" href="#/fun" style="--cc: var(--clay)">
          <div class="cc-badge" style="--cc: var(--clay)">自由区</div>
          <h2 class="cc-title">音乐乐园</h2>
          <p class="cc-desc">钢琴 / 吉他 + 鼓机 + 和声进行，随便玩</p>
          <span class="cc-action">去玩 →</span>
        </a>
        <a class="chapter-card" href="#/daily" style="--cc: var(--fa)">
          <div class="cc-badge" style="--cc: var(--fa)">练习</div>
          <h2 class="cc-title">每日挑战</h2>
          <p class="cc-desc">每天 10 题跨知识点混合挑战，答完看小结</p>
          <span class="cc-action">${daily.done ? '今日已完成，再取更好成绩' : '去挑战'} →</span>
        </a>
        <a class="chapter-card" href="#/mistakes" style="--cc: var(--si)">
          <div class="cc-badge" style="--cc: var(--si)">练习</div>
          <h2 class="cc-title">错题本</h2>
          <p class="cc-desc">答错的题自动收进来，重练答对即移出</p>
          <span class="cc-action">${mistakesTotal ? `${mistakesTotal} 条待重练` : '去复习'} →</span>
        </a>
        <a class="chapter-card" href="#/query" style="--cc: var(--clay)">
          <div class="cc-badge" style="--cc: var(--clay)">工具</div>
          <h2 class="cc-title">查询器</h2>
          <p class="cc-desc">和弦 / 音阶：钢琴、吉他指板、五线谱三视图对照</p>
          <span class="cc-action">去查询 →</span>
        </a>
        <a class="chapter-card" href="#/metronome" style="--cc: var(--sol)">
          <div class="cc-badge" style="--cc: var(--sol)">工具</div>
          <h2 class="cc-title">节拍器</h2>
          <p class="cc-desc">BPM 40–208，拍号 2/3/4/6，首拍重音</p>
          <span class="cc-action">开始打拍 →</span>
        </a>
      </div>
    </div>
  `
  return null
}
