//! 学习进度引擎：掌握度算法、简化间隔重复、学习日历与每日目标。
//! 前端持有唯一 JSON 文档（localStorage），每次作答把文档传回来更新。
//! 时间以"天"为粒度（YYYY-MM-DD 字符串），避免依赖时钟时刻。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

pub const DOC_VERSION: u32 = 1;

/// 单个知识点的统计。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct TopicStat {
    pub attempts: u32,
    pub correct: u32,
    /// 连续答对次数（答错清零）
    pub streak: u32,
    /// 掌握度 0–100
    pub mastery: u32,
    /// 下次复习应出现的日期（YYYY-MM-DD）；无则为空
    pub due: String,
    /// 最近学习日期
    pub last_seen: String,
}

/// 单条错题记录。同一 topic + 相同题面摘要只保留一条（id 去重），累计错误次数。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MistakeEntry {
    /// 稳定 id：topic + 题面摘要指纹（跨会话/云同步去重用）
    pub id: String,
    /// 知识点 id（gen_question 的 kind）
    pub topic: String,
    /// 题面摘要（prompt + 正确答案）
    pub summary: String,
    /// 最近一次答错日期（YYYY-MM-DD）
    pub date: String,
    /// 累计错误次数
    pub count: u32,
}

/// 每日挑战当日成绩（文档里存在该日期的条目即视为"今日挑战已完成"）。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct DailyResult {
    pub correct: u32,
    pub total: u32,
}

/// 整份进度文档。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ProgressDoc {
    pub version: u32,
    /// 每日答题数：date -> count
    pub days: HashMap<String, u32>,
    /// 知识点统计：topic id -> stat
    pub topics: HashMap<String, TopicStat>,
    /// 章节微课完成态：chapter id -> 完成的课程序号数组
    pub chapters: HashMap<String, Vec<u32>>,
    /// 每日目标（题数）
    pub daily_goal: u32,
    /// 错题本（追加序列，最旧在前）
    pub mistakes: Vec<MistakeEntry>,
    /// 每日挑战成绩：date -> 当日最好成绩
    pub daily: HashMap<String, DailyResult>,
}

impl Default for ProgressDoc {
    fn default() -> Self {
        ProgressDoc {
            version: DOC_VERSION,
            days: HashMap::new(),
            topics: HashMap::new(),
            chapters: HashMap::new(),
            daily_goal: 15,
            mistakes: Vec::new(),
            daily: HashMap::new(),
        }
    }
}

/// 错题本容量上限：超出时丢弃最早的记录，防止文档无限膨胀。
pub const MISTAKES_CAP: usize = 200;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardDto {
    /// 连续学习天数（今天或昨天有记录起向前数）
    pub streak_days: u32,
    /// 今日答题数
    pub today_count: u32,
    pub daily_goal: u32,
    /// 今日应复习的知识点（到期且已学过）
    pub review_topics: Vec<String>,
    /// 各章节完成课数（chapter id -> count）
    pub chapter_counts: HashMap<String, u32>,
}

/// 错题本视图：按知识点分组（供错题本页面直接渲染）。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MistakeGroupDto {
    /// 知识点 id（重练时传给 gen_question）
    pub topic: String,
    /// 组内条数
    pub count: u32,
    /// 组内累计错误次数
    pub total_wrong: u32,
    /// 组内错题（按累计次数降序、同次数按最近日期降序）
    pub entries: Vec<MistakeEntry>,
}

/// 每日挑战状态（页面初始渲染用）。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyStatusDto {
    /// 今日是否已完成
    pub done: bool,
    pub correct: u32,
    pub total: u32,
    /// 完成后的小结（未完成为空串）
    pub summary: String,
    /// 当前可用题型池（由已学章节决定，传给 gen_question 的 kind）
    pub pool: Vec<String>,
}

// ---------- 简化日期运算（无需 chrono：用天数民用历算法） ----------

/// civil_from_days（Howard Hinnant 算法）：自 1970-01-01 的天数 → (y, m, d)。
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// (y, m, d) → 自 1970-01-01 的天数。
fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u64;
    let mp = if m > 2 { m - 3 } else { m + 9 } as u64;
    let doy = (153 * mp + 2) / 5 + d as u64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe as i64 - 719_468
}

fn parse_date(s: &str) -> Option<i64> {
    let mut it = s.split('-');
    let y: i64 = it.next()?.parse().ok()?;
    let m: u32 = it.next()?.parse().ok()?;
    let d: u32 = it.next()?.parse().ok()?;
    Some(days_from_civil(y, m, d))
}

fn format_date(days: i64) -> String {
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02}")
}

/// 今天（浏览器传入，避免 WASM 取本地时间的坑）。
fn today_from(today: &str) -> i64 {
    parse_date(today).unwrap_or(0)
}

// ---------- 核心算法 ----------

/// 记录一次作答并更新文档。response_ms 为听辨类反应时间（可空传 0）。
/// 返回更新后的完整文档。
pub fn record_answer(mut doc: ProgressDoc, topic: &str, correct: bool, response_ms: u32, today: &str) -> ProgressDoc {
    let t = today_from(today);
    let today_str = format_date(t);
    *doc.days.entry(today_str.clone()).or_insert(0) += 1;

    let stat = doc.topics.entry(topic.to_string()).or_default();
    stat.attempts += 1;
    stat.last_seen = today_str.clone();
    if correct {
        stat.correct += 1;
        stat.streak += 1;
        // 快（听辨 <2.5s）满加成；慢一些少加
        let gain = if response_ms > 0 && response_ms < 2500 { 14 } else if response_ms > 0 { 9 } else { 11 };
        stat.mastery = (stat.mastery + gain).min(100);
        // 间隔重复：连对天数翻倍，封顶 16 天
        let interval = 1i64 << stat.streak.min(4);
        stat.due = format_date(t + interval);
    } else {
        stat.streak = 0;
        stat.mastery = stat.mastery.saturating_sub(15);
        stat.due = format_date(t + 1);
    }
    doc
}

/// 仪表盘数据汇总。
pub fn dashboard(doc: &ProgressDoc, today: &str) -> DashboardDto {
    let t = today_from(today);

    // 连续天数：从今天（或昨天）往前数
    let mut streak = 0u32;
    let mut cursor = if doc.days.contains_key(&format_date(t)) { t } else if doc.days.contains_key(&format_date(t - 1)) { t - 1 } else { t };
    while doc.days.contains_key(&format_date(cursor)) && doc.days[&format_date(cursor)] > 0 {
        streak += 1;
        cursor -= 1;
    }

    // 今日复习：due <= today 且学过的（attempts>0），按掌握度升序
    let mut review: Vec<(String, u32)> = doc
        .topics
        .iter()
        .filter(|(_, s)| s.attempts > 0)
        .filter(|(_, s)| parse_date(&s.due).map(|d| d <= t).unwrap_or(false))
        .map(|(k, s)| (k.clone(), s.mastery))
        .collect();
    review.sort_by_key(|(_, m)| *m);
    let review_topics = review.into_iter().take(6).map(|(k, _)| k).collect();

    let chapter_counts = doc
        .chapters
        .iter()
        .map(|(k, v)| (k.clone(), v.len() as u32))
        .collect();

    DashboardDto {
        streak_days: streak,
        today_count: doc.days.get(&format_date(t)).copied().unwrap_or(0),
        daily_goal: doc.daily_goal,
        review_topics,
        chapter_counts,
    }
}

/// 迁移旧版按章完成的 localStorage 记录（xyy:done:<chapter> JSON 数组）。
pub fn merge_chapter_done(mut doc: ProgressDoc, chapter: &str, done_indexes: Vec<u32>) -> ProgressDoc {
    let entry = doc.chapters.entry(chapter.to_string()).or_default();
    for i in done_indexes {
        if !entry.contains(&i) {
            entry.push(i);
        }
    }
    entry.sort_unstable();
    doc
}

// ---------- 错题本 ----------

/// FNV-1a 64 位指纹：给题面摘要生成稳定 id（无随机、可跨设备去重）。
fn fnv1a(s: &str) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in s.as_bytes() {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}

fn mistake_id(topic: &str, summary: &str) -> String {
    format!("{topic}-{:016x}", fnv1a(summary))
}

/// 记录一次答错：相同（topic, 题面摘要）合并为一条并累加次数、刷新日期；
/// 新记录追加到末尾；总量超过 MISTAKES_CAP 时丢弃最早的一条。
pub fn record_mistake(mut doc: ProgressDoc, topic: &str, summary: &str, today: &str) -> ProgressDoc {
    let summary = summary.trim();
    if topic.is_empty() || summary.is_empty() {
        return doc;
    }
    let id = mistake_id(topic, summary);
    let date = format_date(today_from(today));
    if let Some(e) = doc.mistakes.iter_mut().find(|e| e.id == id) {
        e.count += 1;
        e.date = date;
    } else {
        doc.mistakes.push(MistakeEntry {
            id,
            topic: topic.to_string(),
            summary: summary.to_string(),
            date,
            count: 1,
        });
        if doc.mistakes.len() > MISTAKES_CAP {
            doc.mistakes.remove(0);
        }
    }
    doc
}

/// 重练答对：移除该条错题。id 不存在时静默（幂等）。
pub fn solve_mistake(mut doc: ProgressDoc, id: &str) -> ProgressDoc {
    doc.mistakes.retain(|e| e.id != id);
    doc
}

/// 错题本视图：按知识点分组；组按累计错误次数降序、同分按 topic 名排序；
/// 组内条目按次数降序、同次数按最近日期降序。
pub fn mistakes_view(doc: &ProgressDoc) -> Vec<MistakeGroupDto> {
    let mut order: Vec<String> = Vec::new();
    let mut groups: HashMap<String, Vec<MistakeEntry>> = HashMap::new();
    for e in &doc.mistakes {
        if !groups.contains_key(&e.topic) {
            order.push(e.topic.clone());
        }
        groups.entry(e.topic.clone()).or_default().push(e.clone());
    }
    let mut out: Vec<MistakeGroupDto> = order
        .into_iter()
        .map(|topic| {
            let mut entries = groups.remove(&topic).unwrap_or_default();
            entries.sort_by(|a, b| b.count.cmp(&a.count).then(b.date.cmp(&a.date)));
            let total_wrong = entries.iter().map(|e| e.count).sum();
            MistakeGroupDto {
                count: entries.len() as u32,
                total_wrong,
                topic,
                entries,
            }
        })
        .collect();
    out.sort_by(|a, b| b.total_wrong.cmp(&a.total_wrong).then(a.topic.cmp(&b.topic)));
    out
}

// ---------- 每日挑战 ----------

/// 每日挑战题型池：学过某章（至少完成一课）才解锁该章题型。
/// 第二章是节奏内容，当前 gen_question 尚无节奏题型，暂不贡献题型。
pub fn daily_pool(doc: &ProgressDoc) -> Vec<String> {
    let done = |id: &str| doc.chapters.get(id).map(|v| !v.is_empty()).unwrap_or(false);
    let mut pool: Vec<&str> = Vec::new();
    if done("ch1") {
        pool.push("note-name");
        pool.push("jianpu-digit");
    }
    if done("ch3") {
        pool.push("build-scale");
    }
    if done("ch4") {
        pool.push("interval-see");
        pool.push("interval-ear");
    }
    if done("ch5") {
        pool.push("chord-see");
        pool.push("chord-ear");
        pool.push("build-chord");
    }
    if done("ch6") {
        pool.push("tonal-ear");
    }
    if pool.is_empty() {
        pool.push("note-name"); // 尚未开课时的保底题型
    }
    pool.into_iter().map(String::from).collect()
}

/// 按正确率生成小结文案。
pub fn daily_summary(correct: u32, total: u32) -> String {
    if total == 0 {
        return String::new();
    }
    let pct = correct * 100 / total;
    if correct == total {
        "满分！耳朵和手指都在状态，明天来守擂。".to_string()
    } else if pct >= 80 {
        "很稳！只剩个别知识点需要留心，去错题本扫一眼。".to_string()
    } else if pct >= 60 {
        "过了及格线。把错的几题在错题本里重练一遍会更扎实。".to_string()
    } else {
        "别灰心，混合测试本来就是查漏工具——去错题本逐组重练，明天再战。".to_string()
    }
}

/// 记录每日挑战成绩：同一天多次挑战只保留最好的（正确数更大者覆盖）。
pub fn daily_finish(mut doc: ProgressDoc, correct: u32, total: u32, today: &str) -> ProgressDoc {
    if total == 0 {
        return doc;
    }
    let key = format_date(today_from(today));
    let keep = match doc.daily.get(&key) {
        Some(cur) => cur.correct >= correct,
        None => false,
    };
    if !keep {
        doc.daily.insert(key, DailyResult { correct, total });
    }
    doc
}

/// 每日挑战状态汇总（含题型池与小结）。
pub fn daily_status(doc: &ProgressDoc, today: &str) -> DailyStatusDto {
    let key = format_date(today_from(today));
    let res = doc.daily.get(&key).copied();
    let pool = daily_pool(doc);
    DailyStatusDto {
        done: res.is_some(),
        correct: res.map(|r| r.correct).unwrap_or(0),
        total: res.map(|r| r.total).unwrap_or(0),
        summary: res.map(|r| daily_summary(r.correct, r.total)).unwrap_or_default(),
        pool,
    }
}

// ---------- WASM 接口 ----------

fn from_js(v: JsValue) -> Result<ProgressDoc, JsValue> {
    if v.is_undefined() || v.is_null() {
        return Ok(ProgressDoc::default());
    }
    serde_wasm_bindgen::from_value(v).map_err(|e| JsValue::from_str(&format!("进度文档解析失败：{e}")))
}

fn to_js<T: Serialize>(v: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(v).map_err(|e| JsValue::from_str(&format!("序列化失败：{e}")))
}

#[wasm_bindgen]
pub fn progress_new() -> Result<JsValue, JsValue> {
    to_js(&ProgressDoc::default())
}

#[wasm_bindgen]
pub fn progress_record(doc: JsValue, topic: &str, correct: bool, response_ms: u32, today: &str) -> Result<JsValue, JsValue> {
    let doc = from_js(doc)?;
    to_js(&record_answer(doc, topic, correct, response_ms, today))
}

#[wasm_bindgen]
pub fn progress_dashboard(doc: JsValue, today: &str) -> Result<JsValue, JsValue> {
    let doc = from_js(doc)?;
    to_js(&dashboard(&doc, today))
}

#[wasm_bindgen]
pub fn progress_merge_chapter(doc: JsValue, chapter: &str, done_indexes: JsValue) -> Result<JsValue, JsValue> {
    let doc = from_js(doc)?;
    let idx: Vec<u32> = serde_wasm_bindgen::from_value(done_indexes)
        .map_err(|e| JsValue::from_str(&format!("完成索引解析失败：{e}")))?;
    to_js(&merge_chapter_done(doc, chapter, idx))
}

#[wasm_bindgen]
pub fn progress_set_goal(doc: JsValue, goal: u32) -> Result<JsValue, JsValue> {
    let mut doc = from_js(doc)?;
    doc.daily_goal = goal.clamp(3, 100);
    to_js(&doc)
}

#[wasm_bindgen]
pub fn progress_record_mistake(doc: JsValue, topic: &str, summary: &str, today: &str) -> Result<JsValue, JsValue> {
    let doc = from_js(doc)?;
    to_js(&record_mistake(doc, topic, summary, today))
}

#[wasm_bindgen]
pub fn progress_solve_mistake(doc: JsValue, id: &str) -> Result<JsValue, JsValue> {
    let doc = from_js(doc)?;
    to_js(&solve_mistake(doc, id))
}

#[wasm_bindgen]
pub fn progress_mistakes_view(doc: JsValue) -> Result<JsValue, JsValue> {
    let doc = from_js(doc)?;
    to_js(&mistakes_view(&doc))
}

#[wasm_bindgen]
pub fn progress_daily_finish(doc: JsValue, correct: u32, total: u32, today: &str) -> Result<JsValue, JsValue> {
    let doc = from_js(doc)?;
    to_js(&daily_finish(doc, correct, total, today))
}

#[wasm_bindgen]
pub fn progress_daily_status(doc: JsValue, today: &str) -> Result<JsValue, JsValue> {
    let doc = from_js(doc)?;
    to_js(&daily_status(&doc, today))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn date_roundtrip() {
        for d in [0i64, 1, 59, 365, 366, 719_468, 19_000, 20_000] {
            let s = format_date(d);
            assert_eq!(parse_date(&s), Some(d), "{s} 回环失败");
        }
        assert_eq!(format_date(0), "1970-01-01");
        assert_eq!(format_date(days_from_civil(2026, 10, 25)), "2026-10-25");
        assert_eq!(format_date(days_from_civil(2024, 2, 29)), "2024-02-29"); // 闰年
        assert_eq!(format_date(days_from_civil(2025, 2, 28)), "2025-02-28");
    }

    #[test]
    fn answer_updates_mastery_and_due() {
        let doc = ProgressDoc::default();
        let doc = record_answer(doc, "interval-ear", true, 1500, "2026-10-01");
        let s = &doc.topics["interval-ear"];
        assert_eq!((s.attempts, s.correct, s.streak), (1, 1, 1));
        assert_eq!(s.mastery, 14);
        assert_eq!(s.due, "2026-10-03"); // streak1 → 间隔2天
        // 再连对两次 → 间隔按 2^streak 增长（封顶 16）
        let doc = record_answer(doc, "interval-ear", true, 1200, "2026-10-03");
        let doc = record_answer(doc, "interval-ear", true, 900, "2026-10-07");
        let s = &doc.topics["interval-ear"];
        assert_eq!(s.streak, 3);
        assert_eq!(s.due, "2026-10-15"); // streak3 → 8天
        // 答错：掌握度降、隔天复习
        let doc = record_answer(doc, "interval-ear", false, 0, "2026-10-15");
        let s = &doc.topics["interval-ear"];
        assert_eq!(s.streak, 0);
        assert_eq!(s.mastery, 42 - 15); // 14+14+14=42，答错 -15 → 27
        assert_eq!(s.due, "2026-10-16");
    }

    #[test]
    fn mastery_capped_and_floored() {
        let mut doc = ProgressDoc::default();
        for _ in 0..20 {
            doc = record_answer(doc, "note-name", true, 800, "2026-10-01");
        }
        assert_eq!(doc.topics["note-name"].mastery, 100);
        for _ in 0..30 {
            doc = record_answer(doc, "note-name", false, 0, "2026-10-02");
        }
        assert_eq!(doc.topics["note-name"].mastery, 0);
    }

    #[test]
    fn streak_and_dashboard() {
        let mut doc = ProgressDoc::default();
        // 学了今天和昨天
        doc = record_answer(doc, "a", true, 0, "2026-10-25");
        doc = record_answer(doc, "a", true, 0, "2026-10-24");
        doc = record_answer(doc, "b", true, 0, "2026-10-24");
        let d = dashboard(&doc, "2026-10-25");
        assert_eq!(d.streak_days, 2);
        assert_eq!(d.today_count, 1);
        assert_eq!(d.daily_goal, 15);

        // 到期复习：a 的 due=10-27，未到；造一个昨天的旧知识点
        let mut old = TopicStat {
            attempts: 5,
            correct: 3,
            streak: 0,
            mastery: 30,
            due: "2026-10-25".into(),
            last_seen: "2026-10-20".into(),
        };
        old.attempts = 5;
        doc.topics.insert("old-topic".into(), old);
        let d = dashboard(&doc, "2026-10-25");
        assert!(d.review_topics.contains(&"old-topic".to_string()));
    }

    #[test]
    fn merge_chapter_done_dedupes() {
        let doc = ProgressDoc::default();
        let doc = merge_chapter_done(doc, "ch1", vec![0, 1, 2]);
        let doc = merge_chapter_done(doc, "ch1", vec![1, 2, 3]);
        assert_eq!(doc.chapters["ch1"], vec![0, 1, 2, 3]);
    }

    // ---------- 错题本 ----------

    #[test]
    fn mistake_record_dedupes_by_summary() {
        let doc = ProgressDoc::default();
        // 同一题面摘要：合并为一条，累加次数并刷新日期
        let doc = record_mistake(doc, "interval-ear", "听这两个音…（正确答案：大三度）", "2026-10-01");
        let doc = record_mistake(doc, "interval-ear", "听这两个音…（正确答案：大三度）", "2026-10-03");
        assert_eq!(doc.mistakes.len(), 1);
        assert_eq!(doc.mistakes[0].count, 2);
        assert_eq!(doc.mistakes[0].date, "2026-10-03");
        assert_eq!(doc.mistakes[0].topic, "interval-ear");
        // 不同摘要：新增一条，id 不同
        let doc = record_mistake(doc, "interval-ear", "听这两个音…（正确答案：纯四度）", "2026-10-03");
        assert_eq!(doc.mistakes.len(), 2);
        assert_ne!(doc.mistakes[0].id, doc.mistakes[1].id);
        // 同摘要不同知识点：各自一条
        let doc = record_mistake(doc, "chord-ear", "听这两个音…（正确答案：大三度）", "2026-10-04");
        assert_eq!(doc.mistakes.len(), 3);
        // 空 topic / 空摘要：忽略
        let doc = record_mistake(doc, "", "x", "2026-10-04");
        let doc = record_mistake(doc, "a", "   ", "2026-10-04");
        assert_eq!(doc.mistakes.len(), 3);
    }

    #[test]
    fn mistake_solve_removes_by_id() {
        let doc = ProgressDoc::default();
        let doc = record_mistake(doc, "note-name", "这个音的音名是什么？（C4）", "2026-10-01");
        let id = doc.mistakes[0].id.clone();
        let doc = record_mistake(doc, "note-name", "这个音的音名是什么？（E4）", "2026-10-01");
        assert_eq!(doc.mistakes.len(), 2);
        // 答对移除该条
        let doc = solve_mistake(doc, &id);
        assert_eq!(doc.mistakes.len(), 1);
        assert_eq!(doc.mistakes[0].summary, "这个音的音名是什么？（E4）");
        // 幂等：再移一次/移不存在的 id 均无变化
        let doc = solve_mistake(doc, &id);
        let doc = solve_mistake(doc, "nonexistent");
        assert_eq!(doc.mistakes.len(), 1);
    }

    #[test]
    fn mistake_cap_drops_oldest() {
        let mut doc = ProgressDoc::default();
        for i in 0..(MISTAKES_CAP + 10) {
            doc = record_mistake(doc, "note-name", &format!("题面 {i}"), "2026-10-01");
        }
        assert_eq!(doc.mistakes.len(), MISTAKES_CAP);
        // 最早的 10 条被丢弃：剩余的第一条是第 10 题
        assert_eq!(doc.mistakes[0].summary, "题面 10");
        assert_eq!(doc.mistakes.last().unwrap().summary, format!("题面 {}", MISTAKES_CAP + 9));
    }

    #[test]
    fn mistakes_view_groups_and_sorts() {
        let doc = ProgressDoc::default();
        let doc = record_mistake(doc, "chord-ear", "和弦题 A", "2026-10-01"); // 1 次
        let doc = record_mistake(doc, "chord-ear", "和弦题 A", "2026-10-02"); // 2 次
        let doc = record_mistake(doc, "chord-ear", "和弦题 B", "2026-10-02"); // 1 次
        let doc = record_mistake(doc, "note-name", "音名题 A", "2026-10-03"); // 1 次
        let doc = record_mistake(doc, "note-name", "音名题 A", "2026-10-04"); // 2 次
        let doc = record_mistake(doc, "note-name", "音名题 B", "2026-10-04"); // 1 次
        let doc = record_mistake(doc, "note-name", "音名题 B", "2026-10-05"); // 2 次
        let view = mistakes_view(&doc);
        assert_eq!(view.len(), 2);
        // 组按累计错误次数降序：note-name 4 次 > chord-ear 3 次
        assert_eq!(view[0].topic, "note-name");
        assert_eq!((view[0].count, view[0].total_wrong), (2, 4));
        assert_eq!(view[1].topic, "chord-ear");
        assert_eq!((view[1].count, view[1].total_wrong), (2, 3));
        // 组内按次数降序，同次数最近日期在前：
        // B（2 次，最近 10-05）排在 A（2 次，最近 10-04）前
        let entries = &view[0].entries;
        assert_eq!(entries[0].summary, "音名题 B");
        assert_eq!(entries[0].date, "2026-10-05");
        assert_eq!(entries[1].summary, "音名题 A");
        // 同一题面合并后只剩一条，count=2
        assert_eq!(view[1].entries[0].summary, "和弦题 A");
        assert_eq!(view[1].entries[0].count, 2);
    }

    // ---------- 每日挑战 ----------

    #[test]
    fn daily_pool_unlocks_by_chapter() {
        // 什么都没学：保底题型
        let doc = ProgressDoc::default();
        assert_eq!(daily_pool(&doc), vec!["note-name".to_string()]);
        // 学了 ch1 + ch4
        let mut doc = ProgressDoc::default();
        doc.chapters.insert("ch1".into(), vec![0]);
        doc.chapters.insert("ch4".into(), vec![0, 1]);
        assert_eq!(
            daily_pool(&doc),
            ["note-name", "jianpu-digit", "interval-see", "interval-ear"].map(String::from)
        );
        // 全学完（ch2 不贡献题型）
        let mut doc = ProgressDoc::default();
        for i in 1..=6 {
            doc.chapters.insert(format!("ch{i}"), vec![0]);
        }
        assert_eq!(daily_pool(&doc).len(), 9);
        assert!(!daily_pool(&doc).iter().any(|k| k.contains("rhythm")));
        // 只有章节但数组为空不算学过
        let mut doc = ProgressDoc::default();
        doc.chapters.insert("ch1".into(), vec![]);
        assert_eq!(daily_pool(&doc), vec!["note-name".to_string()]);
    }

    #[test]
    fn daily_finish_keeps_best() {
        let doc = ProgressDoc::default();
        let doc = daily_finish(doc, 6, 10, "2026-10-28");
        let doc = daily_finish(doc, 8, 10, "2026-10-28");
        assert_eq!(doc.daily["2026-10-28"], DailyResult { correct: 8, total: 10 });
        // 更差的成绩不覆盖
        let doc = daily_finish(doc, 7, 10, "2026-10-28");
        assert_eq!(doc.daily["2026-10-28"].correct, 8);
        // 隔天是新的一条
        let doc = daily_finish(doc, 5, 10, "2026-10-29");
        assert_eq!(doc.daily.len(), 2);
        assert_eq!(doc.daily["2026-10-29"].correct, 5);
        // total=0 不记录
        let doc = daily_finish(doc, 0, 0, "2026-10-30");
        assert!(!doc.daily.contains_key("2026-10-30"));
    }

    #[test]
    fn daily_summary_tiers() {
        assert_eq!(daily_summary(0, 0), "");
        assert!(daily_summary(10, 10).contains("满分"));
        assert!(daily_summary(9, 10).contains("很稳"));
        assert!(daily_summary(6, 10).contains("及格线"));
        assert!(daily_summary(3, 10).contains("别灰心"));
    }

    #[test]
    fn daily_status_reflects_doc() {
        let mut doc = ProgressDoc::default();
        doc.chapters.insert("ch1".into(), vec![0]);
        // 未完成：done=false，summary 为空，pool 可用
        let s = daily_status(&doc, "2026-10-28");
        assert!(!s.done);
        assert_eq!(s.summary, "");
        assert_eq!(s.pool, ["note-name", "jianpu-digit"].map(String::from));
        // 完成后：done=true，带成绩与小结
        let doc = daily_finish(doc, 9, 10, "2026-10-28");
        let s = daily_status(&doc, "2026-10-28");
        assert!(s.done);
        assert_eq!((s.correct, s.total), (9, 10));
        assert!(s.summary.contains("很稳"));
        // 换一天又回到未完成
        let s = daily_status(&doc, "2026-10-29");
        assert!(!s.done);
    }

    /// 旧版文档（无 mistakes/daily 字段）必须能正常解析——serde default 兜底。
    #[test]
    fn old_doc_json_still_parses() {
        let old = r#"{"version":1,"days":{"2026-10-25":3},"topics":{},"chapters":{"ch1":[0,1]},"dailyGoal":15}"#;
        let doc: ProgressDoc = serde_json::from_str(old).expect("旧文档解析失败");
        assert_eq!(doc.mistakes.len(), 0);
        assert!(doc.daily.is_empty());
        assert_eq!(doc.chapters["ch1"], vec![0, 1]);
        // 新文档含错题与每日挑战：JSON 回环保持一致
        let doc = record_mistake(doc, "note-name", "题面", "2026-10-25");
        let doc = daily_finish(doc, 7, 10, "2026-10-25");
        let json = serde_json::to_string(&doc).unwrap();
        let back: ProgressDoc = serde_json::from_str(&json).unwrap();
        assert_eq!(back.mistakes, doc.mistakes);
        assert_eq!(back.daily, doc.daily);
        // 混入未知字段也不炸（老前端写新文档的场景）
        let forward: ProgressDoc =
            serde_json::from_str(r#"{"version":1,"dailyGoal":15,"futureField":123}"#).expect("未知字段应被忽略");
        assert_eq!(forward.daily_goal, 15);
    }
}
