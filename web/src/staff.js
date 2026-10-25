// 五线谱渲染（VexFlow 封装）：notes 为 VexFlow key（如 "c/4"、"f#/4"），
// 可选唱名级数着色（digit 1–7 → 唱名七色）。

import { Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow'

const DEGREE_VARS = ['--do', '--re', '--mi', '--fa', '--sol', '--la', '--si']
let cachedColors = null

function degreeColors() {
  if (!cachedColors) {
    const css = getComputedStyle(document.documentElement)
    cachedColors = DEGREE_VARS.map((v) => css.getPropertyValue(v).trim())
  }
  return cachedColors
}

/**
 * 渲染五线谱到容器。
 * notes: [{ key: 'c/4', degree?: 1-7, color?: '#xxx', duration?: 'q'|'w'|'8' }]
 */
export function renderStaff(el, notes, { width, clef = 'treble', timeSig = null } = {}) {
  el.innerHTML = ''
  if (!notes.length) return
  const w = width ?? Math.max(160, notes.length * 52 + 130)
  const h = 150
  const renderer = new Renderer(el, Renderer.Backends.SVG)
  renderer.resize(w, h)
  const ctx = renderer.getContext()
  ctx.setViewBox(0, 0, w, h)

  const stave = new Stave(8, 18, w - 16)
  stave.addClef(clef)
  if (timeSig) stave.addTimeSignature(timeSig)
  stave.setContext(ctx).draw()

  const colors = degreeColors()
  const staveNotes = notes.map(
    (n) =>
      new StaveNote({
        keys: [n.key],
        duration: n.duration || 'q',
        clef,
        align_center: notes.length === 1,
      })
  )
  notes.forEach((n, i) => {
    const color = n.color || (n.degree ? colors[(n.degree - 1) % 7] : null)
    if (color) {
      staveNotes[i].setStyle({ fillStyle: color, strokeStyle: color })
    }
  })

  const voice = new Voice({ num_beats: Math.max(notes.length, 1), beat_value: 4 })
  voice.setMode(Voice.Mode.SOFT)
  voice.addTickables(staveNotes)
  new Formatter().joinVoices([voice]).format([voice], w - 60)
  voice.draw(ctx, stave)
  el.classList.add('staff-fig')
}
