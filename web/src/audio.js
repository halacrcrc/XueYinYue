// 双层声音引擎：
//   即时层 — Web Audio 合成钢琴（页面一打开就能出声，绝不哑音）
//   采样层 — smplr SplendidGrandPiano（真实大钢琴采样，加载就绪后无缝接管）
// 浏览器要求音频必须在用户手势后启动：所有发声入口都先 unlock()。

import { DrumMachine, SplendidGrandPiano } from 'smplr'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function midiToName(midi) {
  return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1)
}

export const DRUM_NAMES = ['kick', 'snare', 'hihat', 'clap']

class AudioEngine {
  constructor() {
    this.ctx = null
    this.piano = null
    this.pianoReady = false
    this.drums = null
    this.drumsReady = false
    this.loadingStarted = false
  }

  /** 用户手势触发：创建/恢复 AudioContext，并开始采样预载。 */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      this.ctx = new AC()
      this._startLoading()
    }
    if (this.ctx.state === 'suspended') this.ctx.resume()
    return this.ctx
  }

  _startLoading() {
    if (this.loadingStarted) return
    this.loadingStarted = true
    try {
      this.piano = SplendidGrandPiano(this.ctx)
      this.piano.ready
        .then(() => {
          this.pianoReady = true
        })
        .catch((err) => console.warn('钢琴采样加载失败，继续使用合成音色', err))
    } catch (err) {
      console.warn('钢琴采样不可用，继续使用合成音色', err)
    }
    try {
      this.drums = DrumMachine(this.ctx, { instrument: 'TR-808' })
      this.drums.ready
        .then(() => {
          this.drumsReady = true
        })
        .catch((err) => console.warn('鼓组采样加载失败，继续使用合成鼓', err))
    } catch (err) {
      console.warn('鼓组采样不可用，继续使用合成鼓', err)
    }
  }

  /**
   * 弹一个音。midi：0–127；velocity 0–127；duration 秒。
   * 采样就绪走真实钢琴，否则合成兜底。
   */
  playNote(midi, { duration = 1.8, velocity = 96, time } = {}) {
    const ctx = this.unlock()
    if (this.pianoReady) {
      this.piano.start({ note: midiToName(midi), duration, velocity, time })
    } else {
      this._synthNote(ctx, midi, duration, velocity, time)
    }
  }

  /** 同时弹多个音（和弦），或按 stagger 秒错开（琶音）。 */
  playNotes(midis, { duration = 2.2, velocity = 96, stagger = 0 } = {}) {
    const ctx = this.unlock()
    const t0 = ctx.currentTime + 0.02
    midis.forEach((m, i) => {
      this.playNote(m, { duration, velocity, time: t0 + i * stagger })
    })
  }

  /** 打一个鼓。name：kick / snare / hihat / clap。采样就绪走 TR-808，否则合成兜底。 */
  playDrum(name, { velocity = 100, time } = {}) {
    const ctx = this.unlock()
    if (this.drumsReady) {
      this.drums.start({ note: name, velocity, time })
    } else {
      this._synthDrum(ctx, name, velocity, time)
    }
  }

  /** 合成鼓兜底：kick 正弦下扫频 / snare 噪声+体 / hihat 高通噪声 / clap 短噪声簇。 */
  _synthDrum(ctx, name, velocity = 100, time) {
    const t = time ?? ctx.currentTime
    const vol = Math.max(0.05, velocity / 127) * 0.9
    const master = ctx.createGain()
    master.connect(ctx.destination)

    if (name === 'kick') {
      master.gain.setValueAtTime(vol * 0.9, t)
      master.gain.exponentialRampToValueAtTime(0.001, t + 0.32)
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(160, t)
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.12)
      osc.connect(master)
      osc.start(t)
      osc.stop(t + 0.35)
      return
    }

    // 噪声类：snare / hihat / clap
    const len = name === 'hihat' ? 0.06 : name === 'clap' ? 0.12 : 0.18
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    if (name === 'hihat') {
      filter.type = 'highpass'
      filter.frequency.value = 8000
      master.gain.setValueAtTime(vol * 0.35, t)
      master.gain.exponentialRampToValueAtTime(0.001, t + len)
    } else if (name === 'clap') {
      filter.type = 'bandpass'
      filter.frequency.value = 1800
      filter.Q.value = 1.2
      master.gain.setValueAtTime(vol * 0.5, t)
      master.gain.exponentialRampToValueAtTime(0.001, t + len)
    } else {
      filter.type = 'bandpass'
      filter.frequency.value = 2200
      filter.Q.value = 0.8
      master.gain.setValueAtTime(vol * 0.6, t)
      master.gain.exponentialRampToValueAtTime(0.001, t + len)
    }
    src.connect(filter)
    filter.connect(master)
    src.start(t)
  }

  /** 合成兜底：类电钢音色（基频三角波 + 若干泛音 + 低通 + 指数衰减）。 */
  _synthNote(ctx, midi, duration, velocity, time) {
    const t = time ?? ctx.currentTime
    const freq = 440 * Math.pow(2, (midi - 69) / 12)
    const vol = Math.max(0.04, velocity / 127) * 0.5

    const master = ctx.createGain()
    master.gain.setValueAtTime(0, t)
    master.gain.linearRampToValueAtTime(vol, t + 0.008)
    master.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(duration, 0.35))

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = Math.min(9000, freq * 7)
    filter.Q.value = 0.4

    // 分音表：[倍频, 幅度]；4.2 倍频模拟轻微失谐的琴弦泛音
    const partials = [
      [1, 1.0, 'triangle'],
      [2, 0.38, 'sine'],
      [3, 0.16, 'sine'],
      [4.2, 0.05, 'sine'],
    ]
    for (const [mult, amp, type] of partials) {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.value = freq * mult
      const g = ctx.createGain()
      g.gain.value = amp
      osc.connect(g)
      g.connect(filter)
      osc.start(t)
      osc.stop(t + duration + 0.4)
    }
    filter.connect(master)
    master.connect(ctx.destination)
  }
}

export const audio = new AudioEngine()
