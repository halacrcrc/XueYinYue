// 首页：问候 + 课程旋律图（真进度点亮）+ 学习仪表盘 + 可弹的钢琴

import { createPiano } from '../piano.js'
import { buildMelodyMap, CHAPTERS } from '../dashboard.js'
import * as progress from '../progress.js'
import { ch1 } from '../content/ch1.js'
import { ch2 } from '../content/ch2.js'
import { ch3 } from '../content/ch3.js'
import { ch4 } from '../content/ch4.js'
import { ch5 } from '../content/ch5.js'
import { ch6 } from '../content/ch6.js'

const LESSON_TOTALS = { ch1: ch1, ch2: ch2, ch3: ch3, ch4: ch4, ch5: ch5, ch6: ch6 }

const TOPIC_LABELS = {
  'note-name': '认音名',
  'jianpu-digit': '认简谱',
  'interval-see': '认音程',
  'interval-ear': '听音程',
  'chord-see': '认和弦',
  'chord-ear': '听和弦',
  'build-scale': '搭音阶',
  'build-chord': '搭和弦',
  'tonal-ear': '调性级数',
}

export function renderHome(main) {
  const dash = progress.getDashboard()

  main.innerHTML = `
    <div class="home">
      <section class="hero">
        <h1 class="hero-title">边玩边学，<br/>乐理一下就懂了</h1>
        <p class="hero-sub">从"这是什么音"到"这段和弦进行为什么好听"——每一课都能点、能听、能弹。</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#/chapter/1">从第一课开始</a>
          <button type="button" class="btn btn-ghost" id="goto-playground">先随便弹弹</button>
        </div>
      </section>

      <section class="dash-strip" aria-label="学习概况">
        <div class="dash-stat">
          <b>${dash.streakDays}</b>
          <span>连续学习天</span>
        </div>
        <div class="dash-stat">
          <b>${dash.todayCount}<i>/${dash.dailyGoal}</i></b>
          <span>今日题数</span>
        </div>
        <div class="dash-review">
          ${dash.reviewTopics.length
            ? `<span class="dash-review-title">今日复习</span>${dash.reviewTopics
                .map((t) => `<span class="review-chip">${TOPIC_LABELS[t] || t}</span>`)
                .join('')}`
            : '<span class="dash-review-title">暂无到期复习——去学一课或练会儿耳</span>'}
        </div>
        <div class="dash-tools">
          <button type="button" class="btn btn-ghost btn-sm" id="export-btn">导出进度</button>
          <label class="btn btn-ghost btn-sm" for="import-file">导入进度</label>
          <input type="file" id="import-file" accept=".json,application/json" hidden />
        </div>
      </section>

      <details class="sync-panel" id="sync-panel">
        <summary>☁ 云同步进度（GitHub / Gitee Gist）</summary>
        <div class="sync-body">
          <div class="sync-fields">
            <label>服务
              <select id="sync-provider">
                <option value="github">GitHub</option>
                <option value="gitee">Gitee</option>
              </select>
            </label>
            <label class="sync-token">访问令牌（只勾选 gist 权限）
              <input type="password" id="sync-token" placeholder="ghp_… / gitee 私人令牌" autocomplete="off" />
            </label>
            <label>Gist ID（首次备份后自动填）
              <input type="text" id="sync-gistid" placeholder="留空即可" autocomplete="off" />
            </label>
          </div>
          <div class="sync-actions">
            <button type="button" class="btn btn-primary btn-sm" id="sync-push">备份到云</button>
            <button type="button" class="btn btn-ghost btn-sm" id="sync-pull">从云恢复（合并）</button>
          </div>
          <p class="sync-status" id="sync-status"></p>
          <p class="sync-help">令牌只保存在你自己的浏览器里，只用于读写这一个 Gist。GitHub：Settings → Developer settings → Personal access tokens（Classic）→ 只勾 <b>gist</b>；Gitee：设置 → 私人令牌 → 只勾 <b>gists</b>。</p>
        </div>
      </details>

      <section class="section melody-map-section" aria-label="课程旋律图">
        <h2 class="section-title">课程是一条旋律</h2>
        <p class="section-sub">七个章节沿五线谱上行，点亮的音符是你的进度。点击任意音符进入章节。</p>
        <div class="melody-map"></div>
        <div class="heat-wrap" aria-label="学习热力图"></div>
      </section>

      <section class="section playground" id="playground" aria-label="钢琴体验区">
        <div class="playground-head">
          <div>
            <h2 class="section-title">先随便弹弹</h2>
            <p class="section-sub">点琴键发声。也可以用电脑键盘：下排 <kbd>z</kbd>–<kbd>m</kbd>、上排 <kbd>q</kbd>–<kbd>p</kbd>。</p>
          </div>
          <div class="chips" role="group" aria-label="琴键标签">
            <button type="button" class="chip is-active" data-label="name">音名</button>
            <button type="button" class="chip" data-label="jianpu">简谱</button>
            <button type="button" class="chip" data-label="none">无</button>
          </div>
        </div>
        <div class="piano-mount" aria-label="钢琴键盘"></div>
        <p class="playground-tip">切换到"简谱"后，琴键会换上唱名颜色：红 do、橙 re、黄 mi、绿 fa、蓝 sol、紫 la、粉 si——这套颜色全站通用。</p>
      </section>
    </div>
  `

  // 旋律图：真进度点亮（done=实心 / active=半亮 / unstarted=空心）
  const chapterStates = {}
  for (const ch of CHAPTERS) {
    const done = dash.chapterCounts[ch.id] ?? 0
    const total = LESSON_TOTALS[ch.id]?.lessons.length ?? 0
    chapterStates[ch.id] = total > 0 && done >= total ? 'done' : done > 0 ? 'active' : 'unstarted'
  }
  // 练耳没有微课，始终可进入
  chapterStates.ear = 'unstarted'
  buildMelodyMap(main.querySelector('.melody-map'), chapterStates)

  // 热力图（最近 12 周）
  renderHeatmap(main.querySelector('.heat-wrap'))

  // 导出 / 导入
  main.querySelector('#export-btn').addEventListener('click', () => {
    const blob = new Blob([progress.exportJson()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `xueyinyue-progress-${progress.todayStr()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  })
  main.querySelector('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      progress.importJson(await file.text())
      alert('进度已导入')
      location.reload()
    } catch (err) {
      alert(`导入失败：${err.message || err}`)
    }
  })

  // 云同步面板
  const syncPanel = main.querySelector('#sync-panel')
  {
    const cfg = progress.getSyncConfig()
    const providerEl = main.querySelector('#sync-provider')
    const tokenEl = main.querySelector('#sync-token')
    const gistEl = main.querySelector('#sync-gistid')
    const statusEl = main.querySelector('#sync-status')
    providerEl.value = cfg.provider || 'github'
    tokenEl.value = cfg.token || ''
    gistEl.value = cfg.gistId || ''
    const saveCfg = () =>
      progress.setSyncConfig({
        provider: providerEl.value,
        token: tokenEl.value.trim(),
        gistId: gistEl.value.trim(),
      })
    providerEl.addEventListener('change', saveCfg)
    tokenEl.addEventListener('change', saveCfg)
    gistEl.addEventListener('change', saveCfg)

    main.querySelector('#sync-push').addEventListener('click', async (e) => {
      saveCfg()
      e.target.disabled = true
      statusEl.textContent = '上传中…'
      statusEl.className = 'sync-status'
      try {
        const id = await progress.pushToCloud()
        gistEl.value = id
        saveCfg()
        statusEl.textContent = `已备份 ✓（Gist：${id}）`
        statusEl.classList.add('is-ok')
      } catch (err) {
        statusEl.textContent = `备份失败：${err.message || err}`
        statusEl.classList.add('is-err')
      } finally {
        e.target.disabled = false
      }
    })

    main.querySelector('#sync-pull').addEventListener('click', async (e) => {
      saveCfg()
      e.target.disabled = true
      statusEl.textContent = '下载合并中…'
      statusEl.className = 'sync-status'
      try {
        await progress.pullFromCloud()
        statusEl.textContent = '已恢复并合并 ✓，即将刷新页面…'
        statusEl.classList.add('is-ok')
        setTimeout(() => location.reload(), 900)
      } catch (err) {
        statusEl.textContent = `恢复失败：${err.message || err}`
        statusEl.classList.add('is-err')
        e.target.disabled = false
      }
    })
  }

  const piano = createPiano(main.querySelector('.piano-mount'), {
    startMidi: 60,
    octaves: 2,
  })

  main.querySelector('#goto-playground').addEventListener('click', () => {
    const pg = main.querySelector('#playground')
    if (!pg) return
    // 部分内嵌浏览器不支持平滑滚动，用瞬时滚动兼容
    const y = pg.getBoundingClientRect().top + window.scrollY - 64
    window.scrollTo(0, Math.max(0, y))
  })

  main.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      main.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'))
      chip.classList.add('is-active')
      const mode = chip.dataset.label
      if (mode === 'jianpu') {
        piano.setKey('C', 'major')
        piano.setLabel('jianpu')
      } else {
        piano.setLabel(mode)
      }
    })
  })

  return piano
}

function renderHeatmap(wrap) {
  const doc = progress.getDoc()
  const days = doc.days || {}
  const cells = []
  const today = new Date()
  // 对齐到周一为每列第一格；取 12 周 = 84 天
  const dayMs = 86400000
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  for (let i = 83; i >= 0; i--) {
    const d = new Date(end - i * dayMs)
    const p = (n) => String(n).padStart(2, '0')
    const key = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    const count = days[key] ?? 0
    const level = count === 0 ? 0 : count < 5 ? 1 : count < 15 ? 2 : count < 30 ? 3 : 4
    cells.push(
      `<span class="heat-cell lv${level}" title="${key}：${count} 题"></span>`
    )
  }
  wrap.innerHTML = `<div class="heat-grid">${cells.join('')}</div>`
}
