import './styles/main.css'
import init, { core_version } from './wasm/xueyinyue-core.js'
import { renderHome } from './pages/home.js'
import { CHAPTERS } from './dashboard.js'
import { renderChapter } from './lesson.js'
import { renderEar } from './pages/ear.js'
import { renderFun } from './pages/fun.js'
import { renderChapters } from './pages/chapters.js'
import { renderDaily } from './pages/daily.js'
import { renderMistakes } from './pages/mistakes.js'
import { renderQuery } from './pages/query.js'
import { renderMetronome } from './pages/metronome.js'
import { ch1 } from './content/ch1.js'
import { ch2 } from './content/ch2.js'
import { ch3 } from './content/ch3.js'
import { ch4 } from './content/ch4.js'
import { ch5 } from './content/ch5.js'
import { ch6 } from './content/ch6.js'
import { ch7 } from './content/ch7.js'
import { ch8 } from './content/ch8.js'

const CHAPTER_CONTENT = { 1: ch1, 2: ch2, 3: ch3, 4: ch4, 5: ch5, 6: ch6, 7: ch7, 8: ch8 }

let currentPage = null // 当前页持有的组件（如钢琴），路由切换时销毁
let hasRendered = false

function renderChapterPage(main, id) {
  if (id === 'ear') {
    return renderEar(main)
  }
  const num = Number(id)
  const def = CHAPTER_CONTENT[num]
  if (def) {
    return renderChapter(main, def)
  }
  const ch = CHAPTERS[num - 1]
  if (!ch) {
    location.hash = '#/'
    return null
  }
  main.innerHTML = `
    <div class="chapter-page">
      <a class="back-link" href="#/">← 返回首页</a>
      <span class="chapter-chip" style="--chapter-color: var(${ch.colorVar})">${ch.label}</span>
      <h1 class="chapter-title">${ch.title}</h1>
      <p class="chapter-notice">这一章还在谱曲中。第一到八章已经可以学了。</p>
    </div>`
  return null
}

function route() {
  const hash = location.hash || '#/'
  // 页内锚点（如 #playground）不是路由：保留当前页面与滚动位置
  if (!hash.startsWith('#/')) {
    if (!hasRendered) {
      hasRendered = true
      currentPage = renderHome(main0())
    }
    return
  }
  const main = document.querySelector('main')
  if (currentPage?.destroy) currentPage.destroy()
  currentPage = null
  if (hash === '#/' || hash === '') {
    currentPage = renderHome(main)
  } else if (hash.startsWith('#/chapters')) {
    currentPage = renderChapters(main)
  } else if (hash.startsWith('#/chapter/')) {
    currentPage = renderChapterPage(main, hash.split('/').pop())
  } else if (hash.startsWith('#/fun')) {
    currentPage = renderFun(main)
  } else if (hash.startsWith('#/daily')) {
    currentPage = renderDaily(main)
  } else if (hash.startsWith('#/mistakes')) {
    currentPage = renderMistakes(main)
  } else if (hash.startsWith('#/query')) {
    currentPage = renderQuery(main)
  } else if (hash.startsWith('#/metronome')) {
    currentPage = renderMetronome(main)
  } else if (hash.startsWith('#/ear')) {
    currentPage = renderChapterPage(main, 'ear')
  } else {
    location.hash = '#/'
    return
  }
  hasRendered = true
  // 顶部导航高亮
  document.querySelectorAll('.nav-link').forEach((a) => {
    a.classList.toggle('is-active', a.getAttribute('href') === hash)
  })
}

function main0() {
  return document.querySelector('main')
}

async function boot() {
  try {
    await init()
    const badge = document.querySelector('#engine-version')
    badge.textContent = `乐理引擎 v${core_version()}`
    badge.classList.add('is-ready')
  } catch (err) {
    const badge = document.querySelector('#engine-version')
    badge.textContent = '引擎未连接'
    console.error('WASM 引擎加载失败：', err)
  }
  window.addEventListener('hashchange', route)
  route()
}

boot()
