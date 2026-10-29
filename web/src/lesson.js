// 微课引擎：章节 = 若干微课；每课由块（讲解/波形/五线谱/简谱/钢琴演示/练习）组成。
// 练习块的四向题目由 Rust 出题并判分，前端只呈现与收集作答。

import { audio } from './audio.js'
import { createPiano } from './piano.js'
import { renderStaff } from './staff.js'
import { renderJianpu, jianpuItemsFromScale } from './jianpu.js'
import { mountWaves } from './waves.js'
import { createSequencer } from './sequencer.js'
import { createTapTrainer } from './tap-trainer.js'
import { createFifths } from './components/fifths.js'
import * as progress from './progress.js'
import {
  scale as wasmScale,
  diatonic_triads as wasmDiatonic,
  progressions as wasmProgressions,
  gen_question,
  check_answer,
} from './wasm/xueyinyue-core.js'

const DEGREE_VARS = ['--do', '--re', '--mi', '--fa', '--sol', '--la', '--si']

function resolveVar(name) {
  if (!name) return null
  if (name.startsWith('#')) return name
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

const MARKDOWNISH = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`(.+?)`/g, '<kbd>$1</kbd>')

/** 渲染一个章节。返回带 destroy 的句柄。 */
export function renderChapter(main, chapter) {
  const components = [] // 需要销毁的组件（钢琴等）
  const done = new Set(JSON.parse(localStorage.getItem(`xyy:done:${chapter.id}`) || '[]'))
  let current = 0

  main.innerHTML = `
    <div class="lesson-layout">
      <aside class="lesson-rail">
        <a class="back-link" href="#/">← 首页</a>
        <a class="back-link" href="#/chapters">☰ 全部章节</a>
        <span class="chapter-chip" style="--chapter-color: var(${chapter.colorVar})">${chapter.badge || '章节'}</span>
        <h1 class="chapter-title sm">${chapter.title}</h1>
        <ol class="lesson-list"></ol>
      </aside>
      <section class="lesson-main"></section>
    </div>
  `
  const listEl = main.querySelector('.lesson-list')
  const mainEl = main.querySelector('.lesson-main')

  chapter.lessons.forEach((lesson, i) => {
    const li = document.createElement('li')
    li.innerHTML = `<button type="button"><span class="dot"></span>${lesson.title}</button>`
    li.querySelector('button').addEventListener('click', () => show(i))
    listEl.appendChild(li)
  })

  function refreshRail() {
    listEl.querySelectorAll('li').forEach((li, i) => {
      li.classList.toggle('is-done', done.has(i))
      li.classList.toggle('is-current', i === current)
    })
  }

  function show(i) {
    current = i
    const lesson = chapter.lessons[i]
    mainEl.innerHTML = ''
    const art = document.createElement('article')
    art.className = 'lesson'
    art.innerHTML = `<h2 class="lesson-title">${lesson.title}</h2>`
    mainEl.appendChild(art)

    for (const block of lesson.blocks) {
      renderBlock(art, block, () => {
        // 练习完成回调
        done.add(current)
        progress.markLessonDone(chapter.id, current)
        refreshRail()
      })
    }

    // 底部导航
    const nav = document.createElement('footer')
    nav.className = 'lesson-nav'
    nav.innerHTML = `
      <button type="button" class="btn btn-ghost" ${i === 0 ? 'disabled' : ''}>上一课</button>
      <span class="lesson-progress">${i + 1} / ${chapter.lessons.length}</span>
      ${i < chapter.lessons.length - 1
        ? '<button type="button" class="btn btn-primary next-btn">下一课 →</button>'
        : '<a class="btn btn-primary" href="#/">完成本章 ♪</a>'}
    `
    if (i > 0) {
      nav.querySelector('.btn-ghost').addEventListener('click', () => show(i - 1))
    }
    const nextBtn = nav.querySelector('.next-btn')
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        done.add(i)
        progress.markLessonDone(chapter.id, i)
        show(i + 1)
      })
    }
    art.appendChild(nav)
    refreshRail()
    window.scrollTo(0, 0)
  }

  // ---------- 块渲染 ----------

  function renderBlock(art, block, onQuizDone) {
    if (block.t === 'p') {
      const p = document.createElement('p')
      p.className = 'lesson-p'
      p.innerHTML = MARKDOWNISH(block.text)
      art.appendChild(p)
      return
    }
    if (block.t === 'callout') {
      const d = document.createElement('aside')
      d.className = 'callout'
      d.innerHTML = MARKDOWNISH(block.text)
      art.appendChild(d)
      return
    }
    if (block.t === 'waves') {
      const wrap = document.createElement('figure')
      wrap.className = 'fig'
      const canvas = document.createElement('canvas')
      canvas.className = 'waves-canvas'
      wrap.appendChild(canvas)
      if (block.caption) {
        const c = document.createElement('figcaption')
        c.className = 'fig-caption'
        c.textContent = block.caption
        wrap.appendChild(c)
      }
      art.appendChild(wrap)
      components.push(
        mountWaves(canvas, {
          voices: (block.voices || []).map((v) => ({ ...v, color: resolveVar(v.colorVar) || v.color })),
        })
      )
      return
    }
    if (block.t === 'staff') {
      const wrap = document.createElement('figure')
      wrap.className = 'fig'
      const st = document.createElement('div')
      wrap.appendChild(st)
      if (block.caption) {
        const c = document.createElement('figcaption')
        c.className = 'fig-caption'
        c.textContent = block.caption
        wrap.appendChild(c)
      }
      art.appendChild(wrap)
      renderStaff(st, block.notes, { timeSig: block.timeSig })
      return
    }
    if (block.t === 'jianpu') {
      const wrap = document.createElement('figure')
      wrap.className = 'fig'
      const jp = document.createElement('div')
      wrap.appendChild(jp)
      if (block.caption) {
        const c = document.createElement('figcaption')
        c.className = 'fig-caption'
        c.textContent = block.caption
        wrap.appendChild(c)
      }
      art.appendChild(wrap)
      let items = block.items
      if (block.scale) {
        const dto = wasmScale(block.scale.tonic, block.scale.kind || 'major', block.scale.octave ?? 4)
        items = jianpuItemsFromScale(dto, { includeOctaveTonic: block.scale.includeOctaveTonic ?? true })
      }
      renderJianpu(jp, items, {})
      return
    }
    if (block.t === 'demo') {
      renderDemoBlock(art, block)
      return
    }
    if (block.t === 'diatonic') {
      renderDiatonicBlock(art, block)
      return
    }
    if (block.t === 'progression') {
      renderProgressionBlock(art, block)
      return
    }
    if (block.t === 'keytool') {
      renderKeyToolBlock(art, block)
      return
    }
    if (block.t === 'fifths') {
      // 第七章：五度圈互动（组件自带 SVG 环、调号盘与 I–IV–V–I 播放）
      const wrap = document.createElement('figure')
      wrap.className = 'fig'
      const ring = document.createElement('div')
      wrap.appendChild(ring)
      if (block.caption) {
        const c = document.createElement('figcaption')
        c.className = 'fig-caption'
        c.textContent = block.caption
        wrap.appendChild(c)
      }
      art.appendChild(wrap)
      components.push(createFifths(ring, { tonic: block.tonic || 'C', mode: block.mode || 'major' }))
      return
    }
    if (block.t === 'sequencer') {
      const wrap = document.createElement('figure')
      wrap.className = 'fig'
      const seqEl = document.createElement('div')
      wrap.appendChild(seqEl)
      if (block.caption) {
        const c = document.createElement('figcaption')
        c.className = 'fig-caption'
        c.textContent = block.caption
        wrap.appendChild(c)
      }
      art.appendChild(wrap)
      const seq = createSequencer(seqEl, {
        bpm: block.bpm ?? 96,
        pattern: block.pattern ?? null,
      })
      components.push(seq)
      return
    }
    if (block.t === 'tap') {
      const wrap = document.createElement('figure')
      wrap.className = 'fig'
      const tapEl = document.createElement('div')
      wrap.appendChild(tapEl)
      if (block.caption) {
        const c = document.createElement('figcaption')
        c.className = 'fig-caption'
        c.textContent = block.caption
        wrap.appendChild(c)
      }
      art.appendChild(wrap)
      components.push(createTapTrainer(tapEl, { bpm: block.bpm ?? 90, beats: block.beats ?? 8 }))
      return
    }
    if (block.t === 'quiz') {
      renderQuizBlock(art, block, onQuizDone)
      return
    }
    if (block.t === 'drill') {
      renderDrillBlock(art, block, onQuizDone)
      return
    }
  }

  function renderDemoBlock(art, block) {
    const wrap = document.createElement('figure')
    wrap.className = 'fig demo-block'
    const body = document.createElement('div')
    body.className = 'demo-body'
    wrap.appendChild(body)
    art.appendChild(wrap)

    // 可选：音阶/和弦说明行（由 Rust 计算）
    let info = null
    if (block.scale) {
      const dto = wasmScale(block.scale.tonic, block.scale.kind || 'major', block.scale.octave ?? 4)
      info = {
        midis: dto.notes.map((n) => n.midi),
        names: dto.notes.map((n) => n.name),
        jianpuItems: jianpuItemsFromScale(dto),
      }
    }

    const pianoMount = document.createElement('div')
    body.appendChild(pianoMount)

    const piano = createPiano(pianoMount, {
      startMidi: block.startMidi ?? 55,
      octaves: block.octaves ?? 2,
      keyboard: false,
    })
    components.push(piano)

    // 简谱/级数上下文
    if (block.key) piano.setKey(block.key.tonic, block.key.mode || 'major')
    piano.setLabel(block.label || (block.key ? 'jianpu' : 'name'))

    // 高亮集合
    let highlightMidis = block.highlight ?? (info ? info.midis : [])
    const hlColor = resolveVar(block.colorVar || chapter.colorVar)

    // 播放按钮 + 标签切换
    const bar = document.createElement('div')
    bar.className = 'demo-bar'
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'btn btn-primary'
    btn.textContent = block.button || '听示范'
    bar.appendChild(btn)

    const initialLabel = block.label || (block.key ? 'jianpu' : 'name')
    const chips = document.createElement('div')
    chips.className = 'chips demo-label-chips'
    chips.setAttribute('role', 'group')
    chips.setAttribute('aria-label', '琴键标签')
    for (const [mode, text] of [
      ['name', '音名'],
      ['jianpu', '简谱'],
      ['none', '无'],
    ]) {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'chip' + (mode === initialLabel ? ' is-active' : '')
      chip.textContent = text
      chip.addEventListener('click', () => {
        chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'))
        chip.classList.add('is-active')
        if (mode === 'jianpu') {
          piano.setKey(block.key?.tonic || 'C', block.key?.mode || 'major')
        }
        piano.setLabel(mode)
      })
      chips.appendChild(chip)
    }
    bar.appendChild(chips)
    body.appendChild(bar)

    const applyHighlight = () => {
      piano.setHighlights(highlightMidis.map((m) => [m, hlColor]))
    }
    applyHighlight()

    btn.addEventListener('click', () => {
      let seq = block.play ?? info?.midis ?? []
      const mode = block.playMode ?? 'melody'
      // 双声部：voices = [上声部 midis, 下声部 midis]，逐拍并行播放（对位/曲式示范）
      if (block.voices) {
        const step = block.stepMs ?? 420
        const len = Math.max(...block.voices.map((v) => v.length))
        for (let i = 0; i < len; i++) {
          setTimeout(() => {
            block.voices.forEach((v, vi) => {
              const m = v[i]
              if (m == null) return
              audio.playNote(m, { duration: (step / 1000) * 1.8, velocity: vi === 0 ? 100 : 86 })
              piano.flash(m, { duration: 300, color: hlColor, velocity: 100 })
            })
            setTimeout(applyHighlight, step + 60)
          }, i * step)
        }
        return
      }
      if (mode === 'chord') {
        audio.playNotes(seq, { duration: 2.4, velocity: 100 })
      } else if (mode === 'arp') {
        audio.playNotes(seq, { duration: 1.5, velocity: 100, stagger: 0.32 })
      } else {
        // melody：逐个闪亮 + 声音
        seq.forEach((m, idx) => {
          setTimeout(() => {
            piano.flash(m, { duration: 340, color: hlColor, velocity: 100 })
            // flash 后恢复其余高亮
            setTimeout(applyHighlight, 360)
          }, idx * 420)
        })
        return
      }
      // 和弦/琶音：整体闪烁一次
      seq.forEach((m) => piano.flash(m, { duration: 420, color: hlColor, velocity: 100 }))
      setTimeout(applyHighlight, 440)
    })

    if (block.caption) {
      const c = document.createElement('figcaption')
      c.className = 'fig-caption'
      c.textContent = block.caption
      wrap.appendChild(c)
    }
    if (block.namesCaption && info) {
      const c = document.createElement('figcaption')
      c.className = 'fig-caption'
      c.innerHTML = `音符：${info.names.slice(0, 7).join('、')}`
      wrap.appendChild(c)
    }
  }

  // ---------- 和声块（第六章）----------

  /** 调内三和弦：七个级数按钮，点击即弹。 */
  function renderDiatonicBlock(art, block) {
    const wrap = document.createElement('figure')
    wrap.className = 'fig'
    const grid = document.createElement('div')
    grid.className = 'diatonic-grid'
    wrap.appendChild(grid)
    const tonic = block.tonic || 'C'
    const mode = block.mode || 'major'
    const triads = wasmDiatonic(tonic, mode, 4)
    for (const t of triads) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'diatonic-btn'
      btn.style.setProperty('--dg', `var(${DEGREE_VARS[(t.degree - 1) % 7]})`)
      btn.innerHTML = `
        <span class="dg-roman">${t.roman}</span>
        <span class="dg-symbol">${chordSymbol(t)}</span>
        <span class="dg-degree">简谱 ${t.jianpuDegree}</span>`
      btn.addEventListener('click', () => {
        const midis = t.notes.map((n) => n.midi)
        audio.playNotes(midis, { duration: 2.4, velocity: 102 })
        grid.querySelectorAll('.is-active').forEach((b) => b.classList.remove('is-active'))
        btn.classList.add('is-active')
      })
      grid.appendChild(btn)
    }
    if (block.caption) {
      const c = document.createElement('figcaption')
      c.className = 'fig-caption'
      c.textContent = block.caption
      wrap.appendChild(c)
    }
    art.appendChild(wrap)
  }

  function chordSymbol(t) {
    // root.name() 形如 "C4"，去八度 + 性质后缀
    const name = t.root.name.replace(/-?\d+$/, '')
    const suffix = { major: '', minor: 'm', augmented: 'aug', diminished: 'dim' }[t.quality] ?? ''
    return name + suffix
  }

  /** 和弦进行：钢琴上按小节自动演奏，和弦逐个亮起。 */
  function renderProgressionBlock(art, block) {
    const wrap = document.createElement('figure')
    wrap.className = 'fig'
    const body = document.createElement('div')
    wrap.appendChild(body)
    art.appendChild(wrap)

    const tonic = block.tonic || 'C'
    const mode = block.mode || 'major'
    const bpm = block.bpm ?? 100
    const barDur = (60 / bpm) * 4
    const preset = wasmProgressions().find((p) => p.id === block.id)
    if (!preset) {
      body.innerHTML = `<p class="quiz-error">未知的进行 id：${block.id}</p>`
      return
    }
    const triads = wasmDiatonic(tonic, mode, 4)

    // 进行说明 + 级数序列
    const info = document.createElement('div')
    info.className = 'prog-info'
    info.innerHTML = `<p class="prog-name">${preset.nameZh}（${preset.degrees.map((d) => triads[d - 1].roman).join(' – ')}）</p><p class="prog-desc">${preset.description}</p>`
    body.appendChild(info)

    const pianoMount = document.createElement('div')
    body.appendChild(pianoMount)
    const piano = createPiano(pianoMount, { startMidi: 55, octaves: 2, keyboard: false })
    components.push(piano)
    piano.setKey(tonic, mode)
    piano.setLabel('jianpu')

    const bar = document.createElement('div')
    bar.className = 'demo-bar'
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'btn btn-primary'
    btn.textContent = `▶ 播放进行（${tonic} 调）`
    bar.appendChild(btn)
    body.appendChild(bar)

    let seqTimer = []
    btn.addEventListener('click', () => {
      seqTimer.forEach(clearTimeout)
      seqTimer = []
      preset.degrees.forEach((deg, i) => {
        const triad = triads[deg - 1]
        const midis = triad.notes.map((n) => n.midi)
        const color = resolveVar(DEGREE_VARS[(deg - 1) % 7])
        seqTimer.push(
          setTimeout(() => {
            piano.setHighlights(midis.map((m) => [m, color]))
            audio.playNotes(midis, { duration: barDur * 0.92, velocity: 100 })
          }, i * barDur * 1000)
        )
      })
      seqTimer.push(setTimeout(() => piano.clearHighlights(), preset.degrees.length * barDur * 1000))
    })

    if (block.caption) {
      const c = document.createElement('figcaption')
      c.className = 'fig-caption'
      c.textContent = block.caption
      wrap.appendChild(c)
    }
  }

  /** 移调工具：换主音，音阶/简谱/级数整体平移。 */
  function renderKeyToolBlock(art, block) {
    const wrap = document.createElement('figure')
    wrap.className = 'fig'
    const body = document.createElement('div')
    wrap.appendChild(body)
    art.appendChild(wrap)

    const tonics = block.tonics || ['C', 'G', 'D', 'A', 'F', 'Bb', 'Eb']
    let current = block.tonic || 'C'

    const chips = document.createElement('div')
    chips.className = 'chips keytool-chips'
    for (const t of tonics) {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'chip' + (t === current ? ' is-active' : '')
      chip.textContent = `${t} 大调`
      chip.addEventListener('click', () => {
        current = t
        chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'))
        chip.classList.add('is-active')
        refresh()
      })
      chips.appendChild(chip)
    }
    body.appendChild(chips)

    const pianoMount = document.createElement('div')
    const jianpuMount = document.createElement('div')
    const fact = document.createElement('p')
    fact.className = 'keytool-fact'
    body.append(jianpuMount, pianoMount, fact)
    const piano = createPiano(pianoMount, { startMidi: 55, octaves: 2, keyboard: false })
    components.push(piano)

    function refresh() {
      const dto = wasmScale(current, 'major', 4)
      piano.setKey(current, 'major')
      piano.setLabel('jianpu')
      piano.setHighlights(dto.notes.map((n) => [n.midi, resolveVar('--clay')]))
      renderJianpu(jianpuMount, jianpuItemsFromScale(dto), {})
      const blacks = dto.notes.filter((n) => n.accidental !== 0).map((n) => n.name.replace(/d+$/, ''))
      fact.textContent = blacks.length
        ? `${current} 大调需要用到的黑键：${blacks.join('、')}。级数关系（1 2 3 4 5 6 7）不变，只是整体搬了家。`
        : `${current} 大调恰好全是白键。`
    }
    refresh()

    if (block.caption) {
      const c = document.createElement('figcaption')
      c.className = 'fig-caption'
      c.textContent = block.caption
      wrap.appendChild(c)
    }
  }

  // ---------- 练习块 ----------

  function renderQuizBlock(art, block, onDone) {
    const wrap = document.createElement('section')
    wrap.className = 'quiz-block'
    wrap.innerHTML = `<h3 class="quiz-title">小练习</h3><p class="quiz-sub">${block.intro || '做对做题，手比眼睛记得牢。'}</p>`
    const stage = document.createElement('div')
    stage.className = 'quiz-stage'
    wrap.appendChild(stage)
    art.appendChild(wrap)

    const total = block.count ?? 5
    let index = 0

    function nextQuestion() {
      if (index >= total) {
        stage.innerHTML = `
          <div class="quiz-finish">
            <span class="finish-note">♪</span>
            <p>全部完成！可以继续往下学了。</p>
          </div>`
        onDone?.()
        return
      }
      const kind = block.kinds[index % block.kinds.length]
      let q
      try {
        q = gen_question(kind)
      } catch (e) {
        stage.innerHTML = `<p class="quiz-error">出题失败：${e.message || e}</p>`
        return
      }
      q._t0 = performance.now()
      renderQuestion(stage, q, block)
      index += 1
    }

    function renderQuestion(stage, q, cfg) {
      stage.innerHTML = ''
      const head = document.createElement('div')
      head.className = 'quiz-head'
      head.innerHTML = `<span class="quiz-count">${index + 1}/${total}</span><p class="quiz-prompt">${q.prompt}</p>`
      if (q.subPrompt) {
        head.innerHTML += `<p class="quiz-subprompt">${q.subPrompt}</p>`
      }
      stage.appendChild(head)

      // 谱面
      if (q.staffNotes && q.staffNotes.length) {
        const st = document.createElement('div')
        st.className = 'quiz-staff'
        stage.appendChild(st)
        const colors = DEGREE_VARS.map((v) => resolveVar(v))
        renderStaff(
          st,
          q.staffNotes.map((k) => ({ key: k })),
          {}
        )
      }

      // 播放条
      if (q.play && q.play.length) {
        const bar = document.createElement('div')
        bar.className = 'quiz-playbar'
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'btn btn-ghost'
        btn.textContent = q.playMode === 'chord' ? '🔊 播放和弦' : '🔊 播放'
        btn.addEventListener('click', () => {
          if (q.playMode === 'chord') {
            audio.playNotes(q.play, { duration: 2.6, velocity: 104 })
          } else {
            audio.playNotes(q.play, { duration: 1.6, velocity: 104, stagger: 0.55 })
            setTimeout(() => audio.playNotes(q.play, { duration: 2.2, velocity: 92 }), q.play.length * 550 + 250)
          }
        })
        bar.appendChild(btn)
        stage.appendChild(bar)
        btn.click() // 自动播放一次
      }

      if (q.kind === 'mc') {
        renderMc(stage, q)
      } else {
        renderBuild(stage, q)
      }
    }

    function feedback(stage, result, q) {
      const fb = document.createElement('div')
      fb.className = `quiz-feedback ${result.correct ? 'is-correct' : 'is-wrong'}`
      fb.innerHTML = `
        <p class="fb-line">${result.correct ? '答对了！' : `不对哦，正确答案：${result.answerLabel}`}</p>
        <p class="fb-exp">${result.explanation}</p>`
      const next = document.createElement('button')
      next.type = 'button'
      next.className = 'btn btn-primary'
      next.textContent = index >= total ? '完成' : '下一题 →'
      next.addEventListener('click', nextQuestion)
      fb.appendChild(next)
      stage.appendChild(fb)
      const fbY = fb.getBoundingClientRect().top + window.scrollY - 120
      window.scrollTo(0, Math.max(0, fbY))
    }

    function renderMc(stage, q) {
      const grid = document.createElement('div')
      grid.className = 'option-grid'
      let answered = false
      for (const opt of q.options) {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'option-btn'
        b.textContent = opt.label
        b.addEventListener('click', () => {
          if (answered) return
          answered = true
          const responseMs = Math.round(performance.now() - (q._t0 || performance.now()))
          const result = check_answer(q, opt.key)
          progress.record(q.topic, result.correct, responseMs)
          if (!result.correct) progress.recordMistake(q.topic, `${q.prompt}（正确答案：${result.answerLabel}）`)
          if (result.correct) {
            b.classList.add('is-right')
            if (q.play.length) audio.playNotes(q.play, { duration: 2, velocity: 100 })
          } else {
            b.classList.add('is-wrong')
            // 标出正确项
            grid.querySelectorAll('.option-btn').forEach((x) => {
              if (x.textContent === q.options.find((o) => o.key === q.answer).label) x.classList.add('is-right')
            })
          }
          feedback(stage, result, q)
        })
        grid.appendChild(b)
      }
      stage.appendChild(grid)
    }

    function renderBuild(stage, q) {
      const mount = document.createElement('div')
      mount.className = 'quiz-build'
      stage.appendChild(mount)
      const selected = new Set()

      const piano = createPiano(mount, {
        startMidi: 55,
        octaves: 2,
        keyboard: false,
        onNote: (midi) => {
          if (selected.has(midi)) selected.delete(midi)
          else selected.add(midi)
          const colors = DEGREE_VARS.map((v) => resolveVar(v))
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
        const answer = [...selected].sort((a, b) => a - b).join(',')
        const responseMs = Math.round(performance.now() - (q._t0 || performance.now()))
        const result = check_answer(q, answer)
        progress.record(q.topic, result.correct, responseMs)
        if (!result.correct) progress.recordMistake(q.topic, `${q.prompt}（正确答案：${result.answerLabel}）`)
        // 展示正确键位
        const correctMidis = q.answer.split(',').map(Number)
        const color = resolveVar(result.correct ? '--fa' : '--do')
        piano.setHighlights(correctMidis.map((m) => [m, color]))
        if (!result.correct) {
          audio.playNotes(correctMidis, { duration: 2, velocity: 100, stagger: 0.25 })
        }
        feedback(stage, result, q)
      })
      bar.appendChild(submit)
      stage.appendChild(bar)
    }

    nextQuestion()
  }

  // ---------- 本章特训（不限量程序化出题） ----------

  function renderDrillBlock(art, block, onDone) {
    const wrap = document.createElement('section')
    wrap.className = 'quiz-block drill-block'
    wrap.innerHTML = `
      <h3 class="quiz-title">🔥 本章特训</h3>
      <p class="quiz-sub">${block.intro || '题目由引擎现场生成，做多少道都行——练到你自己喊停。'}</p>`
    const strip = document.createElement('div')
    strip.className = 'drill-strip'
    wrap.appendChild(strip)
    const stage = document.createElement('div')
    stage.className = 'quiz-stage'
    wrap.appendChild(stage)
    art.appendChild(wrap)

    const stats = { asked: 0, correct: 0, streak: 0, best: 0 }
    let finished = false
    let perQuestionPianos = []

    function renderStrip() {
      strip.innerHTML = `
        <span class="drill-stat">第 <b>${stats.asked + (finished ? 0 : 1)}</b> 题</span>
        <span class="drill-stat">答对 <b>${stats.correct}</b>/${stats.asked}</span>
        <span class="drill-stat">连对 <b class="${stats.streak >= 3 ? 'is-hot' : ''}">${stats.streak}</b></span>
        <span class="drill-stat">最佳连对 <b>${stats.best}</b></span>`
    }

    function updateScore(correct) {
      stats.asked += 1
      if (correct) {
        stats.correct += 1
        stats.streak += 1
        stats.best = Math.max(stats.best, stats.streak)
      } else {
        stats.streak = 0
      }
      renderStrip()
    }

    function clearPerQuestion() {
      perQuestionPianos.forEach((c) => c.destroy?.())
      perQuestionPianos = []
    }

    function endSession() {
      finished = true
      clearPerQuestion()
      const pct = stats.asked ? Math.round((stats.correct / stats.asked) * 100) : 0
      const verdict =
        stats.asked === 0
          ? '下次再来练两道？'
          : pct >= 90
            ? '稳如节拍器，这章吃透了！'
            : pct >= 70
              ? '很有感觉，继续保持！'
              : pct >= 45
                ? '找到感觉了——错的题去错题本里再看看'
                : '回过头把课程里的演示再点一遍，会顺畅很多'
      stage.innerHTML = `
        <div class="quiz-finish">
          <span class="finish-note">🔥</span>
          <p>本次特训：答对 <b>${stats.correct}</b> / ${stats.asked}（${pct}%）· 最佳连对 ${stats.best}</p>
          <p class="quiz-sub">${verdict}</p>
        </div>`
      const again = document.createElement('button')
      again.type = 'button'
      again.className = 'btn btn-ghost'
      again.textContent = '再来一轮'
      again.addEventListener('click', () => {
        stats.asked = 0
        stats.correct = 0
        stats.streak = 0
        finished = false
        renderStrip()
        nextQuestion()
      })
      stage.querySelector('.quiz-finish').appendChild(again)
      onDone?.()
    }

    function nextQuestion() {
      if (finished) return
      clearPerQuestion()
      renderStrip()
      stage.innerHTML = ''
      const kind = block.kinds[stats.asked % block.kinds.length]
      let q
      try {
        q = gen_question(kind)
      } catch (e) {
        stage.innerHTML = `<p class="quiz-error">出题失败：${e.message || e}</p>`
        return
      }
      q._t0 = performance.now()

      const head = document.createElement('div')
      head.className = 'quiz-head'
      head.innerHTML = `<p class="quiz-prompt">${q.prompt}</p>`
      if (q.subPrompt) head.innerHTML += `<p class="quiz-subprompt">${q.subPrompt}</p>`
      stage.appendChild(head)

      if (q.staffNotes && q.staffNotes.length) {
        const st = document.createElement('div')
        st.className = 'quiz-staff'
        stage.appendChild(st)
        renderStaff(st, q.staffNotes.map((k) => ({ key: k })), {})
      }

      if (q.play && q.play.length) {
        const bar = document.createElement('div')
        bar.className = 'quiz-playbar'
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'btn btn-ghost'
        btn.textContent = q.playMode === 'chord' ? '🔊 播放和弦' : '🔊 播放'
        btn.addEventListener('click', () => {
          if (q.playMode === 'chord') {
            audio.playNotes(q.play, { duration: 2.6, velocity: 104 })
          } else if (q.playMode === 'tonal') {
            const beat = 0.62
            q.cadence.forEach((chord, i) => {
              audio.playNotes(chord, { duration: beat * 0.95, velocity: 92, time: audio.ctx.currentTime + 0.05 + i * beat })
            })
            const targetAt = audio.ctx.currentTime + 0.05 + q.cadence.length * beat + 0.35
            audio.playNotes(q.play, { duration: 1.5, velocity: 104, time: targetAt })
          } else {
            audio.playNotes(q.play, { duration: 1.6, velocity: 104, stagger: 0.55 })
            setTimeout(() => audio.playNotes(q.play, { duration: 2.2, velocity: 92 }), q.play.length * 550 + 250)
          }
        })
        bar.appendChild(btn)
        stage.appendChild(bar)
        btn.click()
      }

      function feedback(result) {
        updateScore(result.correct)
        const fb = document.createElement('div')
        fb.className = `quiz-feedback ${result.correct ? 'is-correct' : 'is-wrong'}`
        fb.innerHTML = `
          <p class="fb-line">${result.correct ? '答对了！' : `正确答案：${result.answerLabel}`}</p>
          <p class="fb-exp">${result.explanation}</p>`
        const row = document.createElement('div')
        row.className = 'drill-fb-actions'
        const next = document.createElement('button')
        next.type = 'button'
        next.className = 'btn btn-primary'
        next.textContent = '下一题 →'
        next.addEventListener('click', nextQuestion)
        const stop = document.createElement('button')
        stop.type = 'button'
        stop.className = 'btn btn-ghost'
        stop.textContent = '结束特训'
        stop.addEventListener('click', endSession)
        row.append(next, stop)
        fb.appendChild(row)
        stage.appendChild(fb)
        const fbY = fb.getBoundingClientRect().top + window.scrollY - 120
        window.scrollTo(0, Math.max(0, fbY))
      }

      if (q.kind === 'mc') {
        const grid = document.createElement('div')
        grid.className = 'option-grid'
        let answered = false
        const correctLabel = q.options.find((o) => o.key === q.answer)?.label
        for (const opt of q.options) {
          const b = document.createElement('button')
          b.type = 'button'
          b.className = 'option-btn'
          b.textContent = opt.label
          const solfegeIdx = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'].indexOf(opt.label)
          if (solfegeIdx >= 0) {
            b.style.setProperty('--dg', `var(${DEGREE_VARS[solfegeIdx]})`)
            b.classList.add('is-solfege')
          }
          b.addEventListener('click', () => {
            if (answered) return
            answered = true
            const responseMs = Math.round(performance.now() - (q._t0 || performance.now()))
            const result = check_answer(q, opt.key)
            progress.record(q.topic, result.correct, responseMs)
            if (result.correct) {
              b.classList.add('is-right')
              if (q.play.length) audio.playNotes(q.play, { duration: 2, velocity: 100 })
            } else {
              b.classList.add('is-wrong')
              grid.querySelectorAll('.option-btn').forEach((x) => {
                if (x.textContent === correctLabel) x.classList.add('is-right')
              })
            }
            feedback(result)
          })
          grid.appendChild(b)
        }
        stage.appendChild(grid)
      } else {
        // build 题：钢琴上搭
        const mount = document.createElement('div')
        mount.className = 'quiz-build'
        stage.appendChild(mount)
        const selected = new Set()
        const piano = createPiano(mount, { startMidi: 55, octaves: 2, keyboard: false })
        perQuestionPianos.push(piano)
        piano.setHighlights([])
        const bar = document.createElement('div')
        bar.className = 'quiz-playbar'
        const submit = document.createElement('button')
        submit.type = 'button'
        submit.className = 'btn btn-primary'
        submit.textContent = '检查'
        submit.addEventListener('click', () => {
          if (submit.disabled) return
          submit.disabled = true
          const answer = [...selected].sort((a, b) => a - b).join(',')
          const responseMs = Math.round(performance.now() - (q._t0 || performance.now()))
          const result = check_answer(q, answer)
          progress.record(q.topic, result.correct, responseMs)
          const correctMidis = q.answer.split(',').map(Number)
          piano.setHighlights(correctMidis.map((m) => [m, resolveVar(result.correct ? '--fa' : '--do')]))
          if (!result.correct) {
            audio.playNotes(correctMidis, { duration: 2, velocity: 100, stagger: 0.25 })
          }
          feedback(result)
        })
        bar.appendChild(submit)
        stage.appendChild(bar)
      }
    }

    renderStrip()
    nextQuestion()
  }

  show(0)

  return {
    destroy() {
      components.forEach((c) => c.destroy?.())
      main.innerHTML = ''
    },
  }
}
