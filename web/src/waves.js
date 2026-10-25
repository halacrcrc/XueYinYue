// 波形可视化（第一章"声音是振动"、第四章"协和=简单频率比"教学用）。
// 画布上同时绘制各分音波形（各自唱名色）与叠加波形，相位随时间流动；
// 离开视口自动暂停，prefers-reduced-motion 时只画静态一帧。

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

export function mountWaves(canvas, { voices = [{ ratio: 1, amp: 1, color: '#26241F' }] } = {}) {
  const ctx = canvas.getContext('2d')
  let raf = 0
  let visible = false
  let phase = 0

  const lanes = voices.length // 每个分音一条泳道 + 下方叠加总波
  const css = getComputedStyle(canvas)
  const laneColors = voices.map((v, i) => v.color || css.getPropertyValue(`--${['do', 're', 'mi', 'fa', 'sol', 'la', 'si'][i % 7]}`).trim() || '#26241F')

  function draw() {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const laneH = lanes > 1 ? Math.min(64, h / (lanes + 1.6)) : 0
    const sumY = lanes > 1 ? h / 2 + laneH / 2 + 14 : h / 2
    const sumH = lanes > 1 ? h - sumY - 12 : h * 0.8

    // 基准波长（px/cycle）——分音按频率比压缩
    const baseCycle = w / 2.2

    // 各分音泳道
    voices.forEach((v, i) => {
      const y0 = 12 + laneH * i + laneH / 2
      drawWave(y0, laneH * 0.42, v.ratio, phase * v.ratio, laneColors[i], 1.6, baseCycle)
    })

    // 叠加波
    ctx.lineWidth = 2.4
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink') || '#26241F'
    ctx.beginPath()
    for (let x = 0; x <= w; x += 1.5) {
      const t = x / baseCycle
      let sum = 0
      let norm = 0
      for (const v of voices) {
        sum += v.amp * Math.sin(2 * Math.PI * (v.ratio * t + phase * v.ratio))
        norm += v.amp
      }
      const y = sumY - (sum / norm) * (sumH / 2)
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()

    function drawWave(y0, amp, ratio, ph, color, lw, cycle) {
      ctx.lineWidth = lw
      ctx.strokeStyle = color
      ctx.beginPath()
      for (let x = 0; x <= w; x += 1.5) {
        const t = x / cycle
        const y = y0 - amp * Math.sin(2 * Math.PI * (ratio * t + ph))
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }

  function loop() {
    if (!visible) return
    phase += 0.008
    draw()
    raf = requestAnimationFrame(loop)
  }

  function start() {
    if (visible && !raf) {
      if (reduceMotion.matches) {
        draw() // 静态一帧
      } else {
        raf = requestAnimationFrame(loop)
      }
    }
  }

  const io = new IntersectionObserver(
    (entries) => {
      visible = entries.some((e) => e.isIntersecting)
      if (visible) start()
      else if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    },
    { threshold: 0.05 }
  )
  io.observe(canvas)
  visible = true
  start()

  return {
    setVoices(next) {
      voices.length = 0
      voices.push(...next)
      draw()
    },
    destroy() {
      io.disconnect()
      if (raf) cancelAnimationFrame(raf)
    },
  }
}
