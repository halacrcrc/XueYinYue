// 进度存取：localStorage 里的唯一版本化 JSON 文档，所有更新都经过 Rust 引擎。

import {
  progress_new,
  progress_record,
  progress_dashboard,
  progress_merge_chapter,
  progress_set_goal,
} from './wasm/xueyinyue-core.js'

const KEY = 'xyy:progress'

export function todayStr() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function loadDoc() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) {
    console.warn('进度文档损坏，重建', e)
  }
  return progress_new()
}

// serde-wasm-bindgen 把 HashMap 序列化成 JS Map，而 JSON.stringify(Map) 会变 "{}"。
// 落盘/导出/给 JS 读之前统一深转普通对象。
function toPlain(v) {
  if (v instanceof Map) {
    const o = {}
    for (const [k, val] of v) o[k] = toPlain(val)
    return o
  }
  if (Array.isArray(v)) return v.map(toPlain)
  if (v && typeof v === 'object') {
    const o = {}
    for (const k of Object.keys(v)) o[k] = toPlain(v[k])
    return o
  }
  return v
}

export function saveDoc(doc) {
  localStorage.setItem(KEY, JSON.stringify(toPlain(doc)))
}

let doc = null

/** 记录一次作答（Rust 更新掌握度/间隔重复/日历），返回仪表盘。 */
export function record(topic, correct, responseMs = 0) {
  doc = progress_record(doc ?? loadDoc(), topic, correct, responseMs, todayStr())
  saveDoc(doc)
  return progress_dashboard(doc, todayStr())
}

/** 标记某章某课完成（迁移旧 xyy:done:<chapter> 键）。 */
export function markLessonDone(chapterId, lessonIdx) {
  doc = doc ?? loadDoc()
  // 迁移旧键（一次性）
  const legacy = localStorage.getItem(`xyy:done:${chapterId}`)
  let idxs = [lessonIdx]
  if (legacy) {
    try {
      idxs = JSON.parse(legacy)
      if (!idxs.includes(lessonIdx)) idxs.push(lessonIdx)
      localStorage.removeItem(`xyy:done:${chapterId}`)
    } catch {
      /* 旧键损坏则忽略 */
    }
  }
  doc = progress_merge_chapter(doc, chapterId, idxs)
  saveDoc(doc)
}

export function getDoc() {
  doc = doc ?? loadDoc()
  return toPlain(doc)
}

export function getDashboard() {
  doc = doc ?? loadDoc()
  return progress_dashboard(doc, todayStr())
}

export function setDailyGoal(goal) {
  doc = progress_set_goal(doc ?? loadDoc(), goal)
  saveDoc(doc)
}

/** 导出为 JSON 文本（备份）。 */
export function exportJson() {
  return JSON.stringify(getDoc(), null, 2)
}

/** 从 JSON 文本导入（恢复）。 */
export function importJson(text) {
  const parsed = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null || !parsed.version) {
    throw new Error('不是有效的进度文档')
  }
  doc = parsed
  saveDoc(doc)
  return doc
}
