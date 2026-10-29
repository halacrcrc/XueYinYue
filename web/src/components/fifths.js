// 五度圈互动组件（第七章「调与五度圈」）：
// SVG 十二调环——外环大调、内环关系小调（小字）、色环十二音位、中心信息盘。
// 点击任一调：点亮该调音阶的七个音位（1–7 级 = 唱名七色）、显示调号（几个升/降号）、
// 播放该调 I–IV–V–I。音符与调内和弦一律由 Rust 引擎（scale / diatonic_triads）计算，
// 本组件只做呈现与发声（audio.playNotes）。
// 对外 API 参照 fretboard.js：createFifths(el, opts) → { el, setKey, destroy }。

import './fifths.css'
import { audio } from '../audio.js'
import {
  scale as wasmScale,
  diatonic_triads as wasmDiatonic,
} from '../wasm/xueyinyue-core.js'

const NS = 'http://www.w3.org/2000/svg'
const CX = 280
const CY = 280
const DEGREE_VARS = ['--do', '--re', '--mi', '--fa', '--sol', '--la', '--si']

// 调号口诀序列（升号 = fa do sol re la mi si；降号正好倒过来）——纯展示用的固定顺序，
// 不做任何判分/出题；所有音符拼写与调内和弦仍由 Rust 计算。
const SHARP_ORDER = ['F♯', 'C♯', 'G♯', 'D♯', 'A♯', 'E♯', 'B♯']
const FLAT_ORDER = ['B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭', 'F♭']

// 十二调顺时针排列：mj 大调主音 / mn 关系小调主音 / sig 调号（正 = 升号数，负 = 降号数）。
// 第 7、8 位平分 6 点钟位置：F♯（6 个升号）与 D♭（5 个降号）同音异名，是圈的"合龙口"。
const KEYS = [
  { mj: 'C', mn: 'a', sig: 0 },
  { mj: 'G', mn: 'e', sig: 1 },
  { mj: 'D', mn: 'b', sig: 2 },
  { mj: 'A', mn: 'f#', sig: 3 },
  { mj: 'E', mn: 'c#', sig: 4 },
  { mj: 'B', mn: 'g#', sig: 5 },
  { mj: 'F#', mn: 'd#', sig: 6, half: true },
  { mj: 'Db', mn: 'bb', sig: -5, half: true },
  { mj: 'Ab', mn: 'f', sig: -4 },
  { mj: 'Eb', mn: 'c', sig: -3 },
  { mj: 'Bb', mn: 'g', sig: -2 },
  { mj: 'F', mn: 'd', sig: -1 },
]

// 未点亮音位的对照拼写（同 audio.js 的 NAME_TABLE 惯例）
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const BPM = 100 // 与第六章进行块一致
const R_MJ = [198, 260] // 外环大调半径
const R_MN = [152, 192] // 内环小调半径
const R_PC = 122 // 色环半径

function pretty(name) {
  // 变音记号只跟在音名字母后：裸的 b（B 小调）/ bb（B♭ 小调）不能被转成 ♭
  return name.replace(/#/g, '♯').replace(/([A-Ga-g])b/g, '$1♭')
}

function stripOctave(name) {
  return name.replace(/-?\d+$/, '')
}

function pt(r, deg) {
  const rad = (deg * Math.PI) / 180
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)]
}

function sectorPath(r0, r1, a0, a1) {
  const [x0, y0] = pt(r1, a0)
  const [x1, y1] = pt(r1, a1)
  const [x2, y2] = pt(r0, a1)
  const [x3, y3] = pt(r0, a0)
  return `M ${x0} ${y0} A ${r1} ${r1} 0 0 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 0 0 ${x3} ${y3} Z`
}

/** 第 i 位的扇区起止角：6 点钟被拆成两半（每半 15°），其余每格 30°。 */
function slotAngles(i) {
  const center = i === 6 ? 82.5 : i === 7 ? 97.5 : -90 + i * 30
  const half = KEYS[i].half ? 7.5 : 15
  const gap = 1.4
  return [center - half + gap, center + half - gap]
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}

function sigText(sig) {
  if (sig === 0) return '无升降号'
  return sig > 0 ? `${sig} 个升号` : `${-sig} 个降号`
}

function sigList(sig) {
  if (sig === 0) return ''
  const list = sig > 0 ? SHARP_ORDER : FLAT_ORDER
  return list.slice(0, Math.abs(sig)).join(' ')
}

function chordSymbol(t) {
  const name = stripOctave(t.root.name)
  const suffix = { major: '', minor: 'm', augmented: 'aug', diminished: 'dim' }[t.quality] ?? ''
  return name + suffix
}

/**
 * 创建五度圈组件。opts: { tonic = 'C', mode = 'major' }
 * 返回 { el, setKey(tonic, mode), destroy() }。
 */
export function createFifths(el, { tonic = 'C', mode = 'major' } = {}) {
  let timers = []
  let triads = []
  let current = null // { tonic, mode }

  el.classList.add('fifths')
  el.setAttribute('role', 'group')
  el.setAttribute('aria-label', '五度圈：点击任一调查看调号并播放 I–IV–V–I')

  const svg = svgEl('svg', {
    class: 'fifths-svg',
    viewBox: `0 0 ${CX * 2} ${CY * 2}`,
    role: 'img',
  })

  // ---- 中心信息盘 ----
  const center = svgEl('g', { class: 'fifths-center' })
  const cTonic = svgEl('text', { x: CX, y: CY - 14, 'text-anchor': 'middle', class: 'fifths-c-tonic' })
  const cMode = svgEl('text', { x: CX, y: CY + 18, 'text-anchor': 'middle', class: 'fifths-c-mode' })
  const cSig = svgEl('text', { x: CX, y: CY + 42, 'text-anchor': 'middle', class: 'fifths-c-sig' })
  const cRel = svgEl('text', { x: CX, y: CY + 68, 'text-anchor': 'middle', class: 'fifths-c-rel' })
  center.append(cTonic, cMode, cSig, cRel)

  // ---- 色环：十二个半音位（点亮 = 该调音阶的七个音位）----
  const pcDots = CHROMATIC.map((name, pc) => {
    const [x, y] = pt(R_PC, -90 + pc * 30)
    const g = svgEl('g', { class: 'fifths-pc' })
    const circle = svgEl('circle', { cx: x, cy: y, r: 15 })
    const label = svgEl('text', { x, y: y + 4.5, 'text-anchor': 'middle' })
    g.append(circle, label)
    svg.appendChild(g)
    return { g, circle, label, pc }
  })

  // 先画色环，再画扇区（扇区盖住色环外圈，互不重叠）
  svg.appendChild(center)

  // ---- 外环大调 / 内环小调扇区 ----
  const sectors = []
  const buildSector = (key, i, ring) => {
    const [r0, r1] = ring === 'major' ? R_MJ : R_MN
    const [a0, a1] = slotAngles(i)
    const g = svgEl('g', {
      class: `fifths-sector is-${ring}`,
      tabindex: '0',
      role: 'button',
    })
    g.appendChild(svgEl('path', { d: sectorPath(r0, r1, a0, a1) }))
    const mid = (a0 + a1) / 2
    if (ring === 'major') {
      const [lx, ly] = pt((r0 + r1) / 2 + 10, mid)
      const label = svgEl('text', { x: lx, y: ly + 8, 'text-anchor': 'middle', class: 'fifths-mj-label' })
      label.textContent = pretty(key.mj)
      const [sx, sy] = pt((r0 + r1) / 2 - 18, mid)
      const sigMini = svgEl('text', { x: sx, y: sy + 4, 'text-anchor': 'middle', class: 'fifths-sig-mini' })
      sigMini.textContent = key.sig === 0 ? '·' : key.sig > 0 ? `${key.sig}♯` : `${-key.sig}♭`
      g.append(label, sigMini)
      g.dataset.tonic = key.mj
      g.dataset.mode = 'major'
      g.setAttribute('aria-label', `${pretty(key.mj)} 大调，${sigText(key.sig)}`)
    } else {
      const [lx, ly] = pt((r0 + r1) / 2, mid)
      const label = svgEl('text', { x: lx, y: ly + 5, 'text-anchor': 'middle', class: 'fifths-mn-label' })
      label.textContent = pretty(key.mn)
      g.appendChild(label)
      g.dataset.tonic = key.mn
      g.dataset.mode = 'minor'
      g.setAttribute('aria-label', `${pretty(key.mn)} 小调（关系小调），${sigText(key.sig)}`)
    }
    const pick = () => setKey(g.dataset.tonic, g.dataset.mode)
    g.addEventListener('click', pick)
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        pick()
      }
    })
    svg.appendChild(g)
    sectors.push(g)
  }
  KEYS.forEach((key, i) => {
    buildSector(key, i, 'major')
    buildSector(key, i, 'minor')
  })

  const mount = document.createElement('div')
  mount.className = 'fifths-mount'
  mount.appendChild(svg)
  el.appendChild(mount)

  // ---- 播放条（HTML，保证 ≥44px 触控目标）----
  const bar = document.createElement('div')
  bar.className = 'fifths-bar'
  const playBtn = document.createElement('button')
  playBtn.type = 'button'
  playBtn.className = 'btn btn-primary fifths-play'
  playBtn.textContent = '▶ 播放 I–IV–V–I'
  const status = document.createElement('p')
  status.className = 'fifths-status'
  status.setAttribute('role', 'status')
  status.textContent = '点一个调，然后播放它的 I–IV–V–I。'
  bar.append(playBtn, status)
  el.appendChild(bar)

  function say(msg) {
    status.textContent = msg
  }

  playBtn.addEventListener('click', () => {
    if (!triads.length) return
    timers.forEach(clearTimeout)
    timers = []
    const barMs = (60 / BPM) * 4 * 1000
    const order = [1, 4, 5, 1]
    order.forEach((deg, i) => {
      const t = triads[deg - 1]
      timers.push(
        setTimeout(() => {
          audio.playNotes(
            t.notes.map((n) => n.midi),
            { duration: (barMs / 1000) * 0.92, velocity: 100 }
          )
          say(`正在播放：${t.roman}（${chordSymbol(t)}）`)
        }, i * barMs)
      )
    })
    timers.push(setTimeout(() => say('播完啦——换一个调再听听，或点圈上的邻居对比。'), 4 * barMs))
  })

  function markActive() {
    for (const g of sectors) {
      const active =
        current &&
        g.dataset.tonic.toUpperCase() === current.tonic.toUpperCase() &&
        g.dataset.mode === current.mode
      g.classList.toggle('is-active', active)
      g.setAttribute('aria-pressed', active ? 'true' : 'false')
    }
  }

  function paintRing(dto) {
    const seven = dto.notes.slice(0, 7)
    const byPc = new Map()
    for (const n of seven) byPc.set(((n.midi % 12) + 12) % 12, n)
    for (const dot of pcDots) {
      const n = byPc.get(dot.pc)
      if (n) {
        const degVar = DEGREE_VARS[(n.degree - 1) % 7]
        const isTonic = n.degree === 1
        dot.g.classList.add('is-lit')
        dot.g.classList.toggle('is-tonic', isTonic)
        dot.circle.style.stroke = `var(${degVar})`
        dot.circle.style.fill = isTonic ? `var(${degVar})` : `color-mix(in srgb, var(${degVar}) 16%, var(--surface))`
        dot.label.textContent = pretty(stripOctave(n.name))
      } else {
        dot.g.classList.remove('is-lit', 'is-tonic')
        dot.circle.style.stroke = ''
        dot.circle.style.fill = ''
        dot.label.textContent = pretty(CHROMATIC[dot.pc])
      }
    }
  }

  function paintCenter(dto, slot) {
    cTonic.textContent = pretty(dto.tonic)
    cMode.textContent = `${current.mode === 'major' ? '大调' : '小调'} · ${sigText(slot.sig)}`
    cSig.textContent = sigList(slot.sig)
    cRel.textContent =
      current.mode === 'major'
        ? `关系小调：${pretty(slot.mn)} 小调`
        : `关系大调：${pretty(slot.mj)} 大调`
  }

  function setKey(t, m = 'major') {
    const kind = m === 'minor' ? 'naturalMinor' : 'major'
    let dto
    try {
      dto = wasmScale(t, kind, 4)
    } catch (e) {
      say(`无法识别的调「${t}」`)
      return
    }
    current = { tonic: dto.tonic, mode: m }
    // 调号要按「大调查 mj / 小调查 mn」匹配：F♯ 大调（6 个升号）与 f♯ 小调（3 个升号）
    // 同主音不同调号，不能混用同一个槽位。
    const slot = KEYS.find((k) =>
      m === 'major'
        ? k.mj.toUpperCase() === dto.tonic.toUpperCase()
        : k.mn.toUpperCase() === dto.tonic.toUpperCase()
    )
    try {
      triads = wasmDiatonic(dto.tonic, kind, 4)
    } catch {
      triads = []
    }
    paintRing(dto)
    paintCenter(dto, slot || { sig: 0, mj: dto.tonic, mn: dto.tonic })
    markActive()
    say(`${pretty(dto.tonic)} ${m === 'major' ? '大调' : '小调'}：${sigText(slot?.sig ?? 0)}${slot?.sig ? `（${sigList(slot.sig)}）` : ''}。可以播 I–IV–V–I 了。`)
  }

  setKey(tonic, mode)

  return {
    el,
    setKey,
    destroy() {
      timers.forEach(clearTimeout)
      timers = []
      el.innerHTML = ''
    },
  }
}
