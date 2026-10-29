// 交互钢琴组件：点击/触摸/电脑键盘，可演奏；
// 支持 高亮集合、唱名着色（调内级数）、标签（音名|简谱|无）、按压手感动画。
//
// 指针手感：容器级 pointer 事件 + 按 pointerId 精确配对——
// 每个 pointer 记录自己按下的键，抬起/取消只松那个键；多指同键走引用计数，
// 滑键（glissando）划到新键即换音。修复双指同按丢音/粘键。

import { audio } from './audio.js'
import { jianpu_for_note } from './wasm/xueyinyue-core.js'
import './piano-fix.css'

const BLACK_OFFSET = [1, 3, 6, 8, 10] // 相对白键 C 的黑键偏移
const DEGREE_VARS = ['--do', '--re', '--mi', '--fa', '--sol', '--la', '--si']
const MIDI_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// 电脑键盘映射（标准 DAW 排列）：下排 = 起始八度，上排 = 高一个八度
const KEY_ROWS = [
  ['z', 's', 'x', 'd', 'c', 'v', 'g', 'b', 'h', 'n', 'j', 'm', ',', 'l', '.', ';', '/'],
  ['q', '2', 'w', '3', 'e', 'r', '5', 't', '6', 'y', '7', 'u', 'i', '9', 'o', '0', 'p'],
]

function isBlackMidi(midi) {
  return BLACK_OFFSET.includes(((midi % 12) + 12) % 12)
}

function midiOctaveName(midi) {
  return MIDI_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1)
}

// 打字时（输入框/可编辑区）不响应演奏与快捷键
function isEditableTarget(t) {
  return (
    t instanceof HTMLElement &&
    (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
  )
}

// ============================================================
// 键位映射浮层（模块级单例）：所有 keyboard:true 的实例共享
// 同一份 ? / Esc 全局监听与同一个浮层 DOM，多钢琴共存也只响应一次。
// ============================================================
const kbInstances = new Set() // keyboard:true 且未 destroy 的实例 meta { startMidi, octaves }
let kbRoot = null // 遮罩（惰性创建，挂在 body）
let kbPanel = null // 对话框面板
let kbGlobalHandler = null // 唯一的全局 keydown（? 开关 / Esc 关闭）
let kbReturnFocus = null // 打开前的 document.activeElement，关闭时还原
let kbActiveMeta = null // 最近一次键盘活动的实例（浮层内容按它生成）

const kbIsOpen = () => Boolean(kbRoot && !kbRoot.hidden)

function ensureKbDom() {
  if (kbRoot) return

  const root = document.createElement('div')
  root.className = 'kb-overlay'
  root.hidden = true

  const panel = document.createElement('div')
  panel.className = 'kb-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-labelledby', 'xyy-kb-overlay-title')
  panel.tabIndex = -1

  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'kb-close'
  closeBtn.setAttribute('aria-label', '关闭键位映射图')
  closeBtn.textContent = '✕'
  closeBtn.addEventListener('click', () => closeKbOverlay())

  const title = document.createElement('h2')
  title.className = 'kb-title'
  title.id = 'xyy-kb-overlay-title'
  title.textContent = '电脑键盘 → 琴键'

  const sub = document.createElement('p')
  sub.className = 'kb-sub'
  sub.textContent = '两排键位各管一个八度：下排低八度，上排高八度。按键即在钢琴上发声。'

  const rows = document.createElement('div')
  rows.className = 'kb-rows'

  const foot = document.createElement('p')
  foot.className = 'kb-foot'
  const kesc = document.createElement('kbd')
  kesc.textContent = 'Esc'
  const kq = document.createElement('kbd')
  kq.textContent = '?'
  foot.append('按 ', kesc, ' 或 ', kq, ' 关闭')

  panel.append(closeBtn, title, sub, rows, foot)
  root.appendChild(panel)

  // 点遮罩（面板外）关闭
  root.addEventListener('click', (e) => {
    if (e.target === root) closeKbOverlay()
  })
  // 焦点圈定：Tab 循环在面板内
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return
    const focusables = panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    if (focusables.length === 0) {
      e.preventDefault()
      return
    }
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  })

  document.body.appendChild(root)
  kbRoot = root
  kbPanel = panel
}

// 按实例 meta 生成两排键位图（每次打开都重建，跟随当前活动钢琴的音域）
function buildKbRows(meta) {
  if (!kbPanel) return
  const rowsEl = kbPanel.querySelector('.kb-rows')
  rowsEl.innerHTML = ''
  const lastMidi = meta.startMidi + meta.octaves * 12
  KEY_ROWS.forEach((chars, r) => {
    const group = document.createElement('div')
    group.className = 'kb-row-group'

    const label = document.createElement('div')
    label.className = 'kb-row-label'
    label.textContent = r === 0 ? '下排 · 低八度' : '上排 · 高八度'

    const row = document.createElement('div')
    row.className = 'kb-row'
    chars.forEach((ch, idx) => {
      const midi = meta.startMidi + r * 12 + idx
      if (midi > lastMidi) return
      const cap = document.createElement('span')
      cap.className = 'kb-cap' + (isBlackMidi(midi) ? ' is-black' : '')
      const k = document.createElement('kbd')
      k.textContent = ch
      const note = document.createElement('span')
      note.textContent = midiOctaveName(midi)
      cap.append(k, note)
      row.appendChild(cap)
    })

    group.append(label, row)
    rowsEl.appendChild(group)
  })
}

function openKbOverlay() {
  const meta = kbActiveMeta || [...kbInstances][0]
  if (!meta) return
  ensureKbDom()
  buildKbRows(meta)
  if (kbRoot.hidden) {
    const active = document.activeElement
    kbReturnFocus = active instanceof HTMLElement ? active : null
    kbRoot.hidden = false
    kbPanel.querySelector('.kb-close').focus()
  }
}

function closeKbOverlay() {
  if (!kbIsOpen()) return
  kbRoot.hidden = true
  if (kbReturnFocus && kbReturnFocus.isConnected) kbReturnFocus.focus()
  kbReturnFocus = null
}

function toggleKbOverlay() {
  if (kbIsOpen()) closeKbOverlay()
  else openKbOverlay()
}

function ensureKbGlobal() {
  if (kbGlobalHandler) return
  kbGlobalHandler = (e) => {
    if (e.key === 'Escape') {
      if (kbIsOpen()) {
        e.preventDefault()
        closeKbOverlay()
      }
      return
    }
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
    if (isEditableTarget(e.target)) return
    // ? = shift+/（中文输入法下 e.key 可能是 'Process'，回退看物理键位）
    const isQuestion =
      e.key === '?' || (e.shiftKey && (e.key === '/' || (e.key === 'Process' && e.code === 'Slash')))
    if (isQuestion) {
      e.preventDefault()
      toggleKbOverlay()
    }
  }
  document.addEventListener('keydown', kbGlobalHandler)
}

function teardownKbGlobal() {
  if (!kbGlobalHandler || kbInstances.size > 0) return
  document.removeEventListener('keydown', kbGlobalHandler)
  kbGlobalHandler = null
  kbActiveMeta = null
  if (kbIsOpen()) closeKbOverlay()
}

// ============================================================
// 钢琴组件
// ============================================================
export function createPiano(el, { startMidi = 60, octaves = 2, onNote = () => {}, keyboard = true } = {}) {
  const state = {
    label: 'name', // 'name' | 'jianpu' | 'none'
    key: null, // { tonic: 'C', mode: 'major' } 简谱/唱名上下文
    highlights: new Map(), // midi -> css color
  }

  // 电脑键位提示（仅在响应键盘的钢琴上显示）：midi → 按键字符
  const keyHints = new Map()
  if (keyboard) {
    KEY_ROWS.forEach((row, r) =>
      row.forEach((ch, idx) => keyHints.set(startMidi + r * 12 + idx, ch))
    )
  }

  // 键位浮层登记：keyboard 实例共享模块级单例（多钢琴共存只响应一次）
  const kbMeta = keyboard ? { startMidi, octaves } : null
  if (kbMeta) {
    kbInstances.add(kbMeta)
    kbActiveMeta = kbMeta
    ensureKbGlobal()
  }

  const total = octaves * 12 + 1
  const midis = Array.from({ length: total }, (_, i) => startMidi + i)
  const whites = midis.filter((m) => !isBlackMidi(m))
  const whiteW = 100 / whites.length
  const blackW = whiteW * 0.62

  el.classList.add('piano')
  el.setAttribute('role', 'group')
  el.setAttribute('aria-label', '钢琴键盘，点击或用电脑键盘弹奏')

  const keyEls = new Map()
  let whiteIndex = 0

  for (const midi of midis) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'piano-key' + (isBlackMidi(midi) ? ' black' : ' white')
    btn.dataset.midi = midi
    btn.setAttribute('aria-label', `琴键 ${midiOctaveName(midi)}`)

    const label = document.createElement('span')
    label.className = 'key-label'
    btn.appendChild(label)

    const degreeBar = document.createElement('span')
    degreeBar.className = 'key-degree-bar'
    btn.appendChild(degreeBar)

    // 电脑键位提示
    if (keyHints.has(midi)) {
      const hint = document.createElement('span')
      hint.className = 'key-hint'
      hint.textContent = keyHints.get(midi)
      btn.appendChild(hint)
    }

    if (isBlackMidi(midi)) {
      // 黑键：横跨其左侧白键的右边界
      const left = (whiteIndex - 0.31) * whiteW
      btn.style.left = `calc(${left}% )`
      btn.style.width = `${blackW}%`
    } else {
      btn.style.left = `${whiteIndex * whiteW}%`
      btn.style.width = `${whiteW}%`
      whiteIndex += 1
    }

    // 键盘可达性：Enter/空格按住即按（e.repeat 防止连按重复计数）
    btn.addEventListener('keydown', (e) => {
      if (e.repeat) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        press(midi)
      }
    })
    btn.addEventListener('keyup', (e) => {
      if (e.key === 'Enter' || e.key === ' ') unpress(midi)
    })

    el.appendChild(btn)
    keyEls.set(midi, btn)
  }

  // ---- 指针管理（容器级，按 pointerId 精确配对）----
  // activePointers: pointerId → 它当前按下的 midi（拖出琴面时记 null；抬起/取消只松自己按的键）
  // pressCount: midi → 同时按住它的来源数（多指同键 / 指针+键盘 / flash 互不误抬）
  const activePointers = new Map()
  const pressCount = new Map()

  function press(midi, { sound = true } = {}) {
    const btn = keyEls.get(midi)
    if (!btn) return
    pressCount.set(midi, (pressCount.get(midi) || 0) + 1)
    btn.classList.add('is-pressed')
    if (sound) audio.playNote(midi, { velocity: 96 })
    onNote(midi)
  }
  function unpress(midi) {
    const n = Math.max(0, (pressCount.get(midi) || 0) - 1)
    if (n === 0) {
      pressCount.delete(midi)
      keyEls.get(midi)?.classList.remove('is-pressed')
    } else {
      pressCount.set(midi, n)
    }
  }

  // 指针所在处的琴键 midi（elementFromPoint 对触摸隐式捕获/鼠标捕获都成立）
  function keyAt(clientX, clientY) {
    const t = document.elementFromPoint(clientX, clientY)
    const key = t && t.closest ? t.closest('.piano-key') : null
    if (!key || !el.contains(key)) return null
    return Number(key.dataset.midi)
  }

  function releasePointer(pointerId) {
    const midi = activePointers.get(pointerId)
    activePointers.delete(pointerId)
    if (midi != null) unpress(midi)
  }

  // 失焦兜底：切窗/弹层抢焦点收不到 keyup/pointerup 时全部复位，杜绝粘键
  const releaseAllHeld = () => {
    for (const id of [...activePointers.keys()]) releasePointer(id)
    for (const k of [...heldKeys]) {
      heldKeys.delete(k)
      const m = midiForKey(k)
      if (m != null) unpress(m)
    }
  }

  el.addEventListener('contextmenu', (e) => e.preventDefault()) // 长按/右键不弹菜单抢走指针
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return // 鼠标右/中键、笔杆键不算演奏（也防抢走已按指针的 capture）
    const midi = keyAt(e.clientX, e.clientY)
    if (midi == null) return
    e.preventDefault()
    try {
      el.setPointerCapture(e.pointerId) // 捕获到容器：拖出琴面仍能收到 move/up
    } catch {
      /* 指针可能在事件队列中已失效，忽略——抬起逻辑不依赖捕获成功 */
    }
    activePointers.set(e.pointerId, midi)
    press(midi)
  })
  // move/up/cancel 挂 document：capture 成功时事件被重定向到 el 再冒泡上来；
  // capture 失败（指针已失效）时拖出琴面也依然收得到——双保险杜绝粘键。
  const onPointerMove = (e) => {
    if (!activePointers.has(e.pointerId)) return
    const midi = keyAt(e.clientX, e.clientY)
    const prev = activePointers.get(e.pointerId)
    if (midi === prev) return
    if (prev != null) unpress(prev)
    if (midi != null) press(midi) // 滑键 glissando：划到新键即发声
    activePointers.set(e.pointerId, midi)
  }
  const onPointerEnd = (e) => {
    if (!activePointers.has(e.pointerId)) return
    releasePointer(e.pointerId)
  }
  document.addEventListener('pointermove', onPointerMove)
  document.addEventListener('pointerup', onPointerEnd)
  document.addEventListener('pointercancel', onPointerEnd) // 浏览器手势接管等：按登记表松键，不掉链子
  window.addEventListener('blur', releaseAllHeld)

  // ---- 电脑键盘映射（可用 keyboard: false 关闭，用于多钢琴共存的页面）----
  const heldKeys = new Set()
  // 中文输入法下 e.key 可能是 'Process' 或组合串，回退用物理键位 e.code
  const charFromCode = (code) => {
    if (code.startsWith('Key')) return code.slice(3).toLowerCase()
    if (code.startsWith('Digit')) return code.slice(5)
    return { Comma: ',', Period: '.', Semicolon: ';', Slash: '/' }[code] || null
  }
  function midiForKey(k) {
    for (let row = 0; row < KEY_ROWS.length; row++) {
      const idx = KEY_ROWS[row].indexOf(k)
      if (idx >= 0) {
        const midi = startMidi + row * 12 + idx
        return keyEls.has(midi) ? midi : null
      }
    }
    return null
  }
  const onDocKey = (e) => {
    if (!keyboard) return
    if (isEditableTarget(e.target)) return // 输入框打字不演奏
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
    let k = e.key.toLowerCase()
    if (e.key === 'Process' || k.length !== 1) {
      const c = charFromCode(e.code)
      if (!c) return
      k = c
    }
    const midi = midiForKey(k)
    if (midi == null) return
    kbActiveMeta = kbMeta // 最近键盘活动实例 → 键位浮层内容来源
    if (e.type === 'keydown') {
      e.preventDefault() // 挡掉 '/' 打开 quick-find 之类的浏览器默认行为
      heldKeys.add(k)
      press(midi)
    } else if (heldKeys.delete(k)) {
      unpress(midi)
    }
  }
  document.addEventListener('keydown', onDocKey)
  document.addEventListener('keyup', onDocKey)

  // ---- 行为 ----
  function midiToLabel(midi, mode) {
    if (mode !== 'name') return ''
    return midiOctaveName(midi)
  }

  function refreshLabels() {
    for (const [midi, btn] of keyEls) {
      const label = btn.querySelector('.key-label')
      const bar = btn.querySelector('.key-degree-bar')
      if (state.label === 'name') {
        label.textContent = midiToLabel(midi, 'name').replace(/\d/, '')
        btn.removeAttribute('data-degree')
        bar.style.background = 'transparent'
      } else if (state.label === 'jianpu' && state.key) {
        try {
          const j = jianpu_for_note(state.key.tonic, state.key.mode, nameForMidi(midi), 4)
          const acc = j.accidental > 0 ? '♯' : j.accidental < 0 ? '♭' : ''
          const dotsHi = '·'.repeat(Math.max(0, j.octaveOffset))
          const dotsLo = '·'.repeat(Math.max(0, -j.octaveOffset))
          label.innerHTML = ''
          if (dotsHi) {
            const hi = document.createElement('i')
            hi.className = 'dots hi'
            hi.textContent = dotsHi
            label.appendChild(hi)
          }
          const d = document.createElement('b')
          d.textContent = `${acc}${j.digit}`
          label.appendChild(d)
          if (dotsLo) {
            const lo = document.createElement('i')
            lo.className = 'dots lo'
            lo.textContent = dotsLo
            label.appendChild(lo)
          }
          btn.dataset.degree = j.digit
          bar.style.background = `var(${DEGREE_VARS[j.digit - 1]})`
        } catch {
          label.textContent = ''
        }
      } else {
        label.textContent = ''
        btn.removeAttribute('data-degree')
        bar.style.background = 'transparent'
      }
    }
  }

  function nameForMidi(midi) {
    return midiOctaveName(midi)
  }

  // 初始渲染一次标签（默认音名模式）
  refreshLabels()

  return {
    el,
    /** label: 'name' | 'jianpu' | 'none' */
    setLabel(mode) {
      state.label = mode
      refreshLabels()
    },
    /** 设置简谱上下文（tonic 如 'C'，mode 如 'major'），键级获得唱名色 */
    setKey(tonic, mode = 'major') {
      state.key = { tonic, mode }
      refreshLabels()
    },
    /** 高亮一组键：entries = [[midi, cssColor], ...] 或纯 [midi, ...]（默认陶土色） */
    setHighlights(entries) {
      this.clearHighlights()
      for (const entry of entries) {
        const [midi, color] = Array.isArray(entry) ? entry : [entry, null]
        const btn = keyEls.get(midi)
        if (!btn) continue
        state.highlights.set(midi, color)
        btn.classList.add('is-highlighted')
        btn.style.setProperty('--hl', color || 'var(--clay)')
      }
    },
    clearHighlights() {
      for (const [midi] of state.highlights) {
        const btn = keyEls.get(midi)
        btn?.classList.remove('is-highlighted')
        btn?.style.removeProperty('--hl')
      }
      state.highlights.clear()
    },
    /** 按下并短暂展示（自动播放示范 / 答题反馈） */
    flash(midi, { duration = 500, velocity = 96, color } = {}) {
      const btn = keyEls.get(midi)
      press(midi, { sound: true })
      if (btn && color) {
        btn.style.setProperty('--hl', color)
        btn.classList.add('is-highlighted')
        setTimeout(() => {
          btn.classList.remove('is-highlighted')
          btn.style.removeProperty('--hl')
        }, duration)
      }
      setTimeout(() => unpress(midi), Math.min(220, duration))
    },
    /** 静音演示一串音（stagger 秒间隔），返回总时长 */
    demonstrate(midis, { stagger = 0.28, color } = {}) {
      midis.forEach((m, i) => {
        setTimeout(() => this.flash(m, { duration: 300, color }), i * stagger * 1000)
      })
      return midis.length * stagger * 1000
    },
    destroy() {
      document.removeEventListener('keydown', onDocKey)
      document.removeEventListener('keyup', onDocKey)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerEnd)
      document.removeEventListener('pointercancel', onPointerEnd)
      window.removeEventListener('blur', releaseAllHeld)
      releaseAllHeld()
      if (kbMeta) {
        kbInstances.delete(kbMeta)
        if (kbActiveMeta === kbMeta) kbActiveMeta = [...kbInstances][0] || null
        teardownKbGlobal()
      }
      el.innerHTML = ''
    },
    _refresh: refreshLabels,
  }
}
