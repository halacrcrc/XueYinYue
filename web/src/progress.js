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

// ============ 云同步（GitHub / Gitee Gist） ============

const SYNC_KEY = 'xyy:sync'
const GIST_FILE = 'xueyinyue-progress.json'

export function getSyncConfig() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}
  } catch {
    return {}
  }
}

export function setSyncConfig(cfg) {
  localStorage.setItem(SYNC_KEY, JSON.stringify(cfg))
}

/** 合并两份进度（各取更大值/并集，可安全重复调用）。 */
export function mergeDocs(a, b) {
  const days = { ...(a.days || {}) }
  for (const [k, v] of Object.entries(b.days || {})) days[k] = Math.max(days[k] || 0, v)
  const topics = { ...(a.topics || {}) }
  for (const [k, t] of Object.entries(b.topics || {})) {
    const cur = topics[k]
    const better =
      !cur ||
      (t.attempts || 0) > (cur.attempts || 0) ||
      ((t.attempts || 0) === (cur.attempts || 0) && (t.correct || 0) > (cur.correct || 0))
    if (better) topics[k] = t
  }
  const chapters = { ...(a.chapters || {}) }
  for (const [k, arr] of Object.entries(b.chapters || {})) {
    chapters[k] = [...new Set([...(chapters[k] || []), ...arr])].sort((x, y) => x - y)
  }
  return {
    version: Math.max(a.version || 1, b.version || 1),
    days,
    topics,
    chapters,
    dailyGoal: Math.max(a.dailyGoal || 15, b.dailyGoal || 15),
  }
}

async function gistRequest(provider, path, { method = 'GET', token, body } = {}) {
  if (provider === 'gitee') {
    const url = new URL('https://gitee.com/api/v5' + path)
    if (token) url.searchParams.set('access_token', token)
    const resp = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!resp.ok) throw new Error(`Gitee ${resp.status}：${(await resp.text()).slice(0, 120)}`)
    return resp.json()
  }
  const resp = await fetch('https://api.github.com' + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!resp.ok) throw new Error(`GitHub ${resp.status}：${(await resp.text()).slice(0, 120)}`)
  return resp.json()
}

async function readGist(cfg) {
  const g = await gistRequest(cfg.provider, `/gists/${cfg.gistId}`, { token: cfg.token })
  const file = g.files && g.files[GIST_FILE]
  if (!file || !file.content) throw new Error('Gist 中找不到进度文件')
  const parsed = JSON.parse(file.content)
  if (!parsed.version) throw new Error('Gist 内容不是有效的进度文档')
  return parsed
}

/** 备份当前进度到云（首次自动创建 Gist 并记住 ID）。返回 gistId。 */
export async function pushToCloud() {
  const cfg = getSyncConfig()
  if (!cfg.token) throw new Error('请先填写访问令牌')
  const content = JSON.stringify(toPlain(getDoc()))
  if (!cfg.gistId) {
    const g = await gistRequest(cfg.provider, '/gists', {
      method: 'POST',
      token: cfg.token,
      body: {
        description: '学音乐 · 学习进度备份（自动创建）',
        public: false,
        files: { [GIST_FILE]: { content } },
      },
    })
    cfg.gistId = g.id
    setSyncConfig(cfg)
  } else {
    await gistRequest(cfg.provider, `/gists/${cfg.gistId}`, {
      method: 'PATCH',
      token: cfg.token,
      body: { files: { [GIST_FILE]: { content } } },
    })
  }
  return cfg.gistId
}

/** 从云端拉取并与本地合并（两边都保留更多内容）。 */
export async function pullFromCloud() {
  const cfg = getSyncConfig()
  if (!cfg.token) throw new Error('请先填写访问令牌')
  if (!cfg.gistId) throw new Error('请先「备份到云」一次以创建 Gist')
  const remote = await readGist(cfg)
  const merged = mergeDocs(toPlain(getDoc()), remote)
  doc = merged
  saveDoc(doc)
  return merged
}
