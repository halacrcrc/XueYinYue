import './styles/main.css'
import init, { core_version } from './wasm/xueyinyue-core.js'
import { renderHome } from './pages/home.js'
import { CHAPTERS } from './dashboard.js'
import { renderChapter } from './lesson.js'
import { renderEar } from './pages/ear.js'
import { renderFun } from './pages/fun.js'
import { ch1 } from './content/ch1.js'
import { ch2 } from './content/ch2.js'
import { ch3 } from './content/ch3.js'
import { ch4 } from './content/ch4.js'
import { ch5 } from './content/ch5.js'
import { ch6 } from './content/ch6.js'

const CHAPTER_CONTENT = { 1: ch1, 2: ch2, 3: ch3, 4: ch4, 5: ch5, 6: ch6 }

let currentPage = null // 当前页持有的组件（如钢琴），路由切换时销毁

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
      <p class="chapter-notice">这一章正在建设中。第一、三、四、五章已经可以学了。</p>
    </div>`
  return null
}

function route() {
  const hash = location.hash || '#/'
  const main = document.querySelector('main')
  if (currentPage?.destroy) currentPage.destroy()
  currentPage = null
  if (hash === '#/' || hash === '') {
    currentPage = renderHome(main)
  } else if (hash.startsWith('#/chapter/')) {
    currentPage = renderChapterPage(main, hash.split('/').pop())
  } else if (hash.startsWith('#/fun')) {
    currentPage = renderFun(main)
  } else if (hash.startsWith('#/ear')) {
    currentPage = renderChapterPage(main, 'ear')
  } else {
    location.hash = '#/'
    return
  }
  // 顶部导航高亮
  document.querySelectorAll('.nav-link').forEach((a) => {
    a.classList.toggle('is-active', a.getAttribute('href') === hash)
  })
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
