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
}

impl Default for ProgressDoc {
    fn default() -> Self {
        ProgressDoc {
            version: DOC_VERSION,
            days: HashMap::new(),
            topics: HashMap::new(),
            chapters: HashMap::new(),
            daily_goal: 15,
        }
    }
}

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
}
