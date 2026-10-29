//! 学音乐核心引擎（Rust → WebAssembly）
//!
//! 职责铁律：所有"对错与分析"（音程判断、判分、掌握度、复习调度、出题）
//! 只发生在本 crate，并带单元测试；前端只做呈现、发声与存取。

mod chord;
mod exercise;
mod interval;
mod jianpu;
mod note;
mod progress;
mod scale;

pub use exercise::{check_answer, gen_question, gen_question_in_key};
pub use progress::{
    progress_daily_finish, progress_daily_status, progress_dashboard, progress_merge_chapter,
    progress_mistakes_view, progress_new, progress_record, progress_record_mistake,
    progress_set_goal, progress_solve_mistake,
};

use chord::{SeventhQuality, TriadQuality};
use interval::{between, Consonance, Quality};
use jianpu::note_to_jianpu;
use note::{Letter, Note, Spelled};
use scale::{scale_notes, step_labels, ScaleKind};
use serde::Serialize;
use wasm_bindgen::prelude::*;

/// 引擎版本号，用于前端连接自检。
#[wasm_bindgen]
pub fn core_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// ============ DTO ============

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JianpuDto {
    digit: u8,
    octave_offset: i8,
    accidental: i8,
    solfege: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteDto {
    midi: i8,
    name: String,
    name_zh: String,
    letter: String,
    accidental: i8,
    octave: i8,
    frequency: f64,
    /// 调内级数（1–7），非调内或无调上下文时为 null。
    degree: Option<u8>,
    jianpu: Option<JianpuDto>,
}

fn note_dto(
    n: Note,
    key: Option<(Spelled, ScaleKind)>,
    reference_octave: i8,
) -> NoteDto {
    let jianpu = key.map(|(tonic, kind)| {
        let j = note_to_jianpu(tonic, kind, reference_octave, n);
        JianpuDto {
            digit: j.digit,
            octave_offset: j.octave_offset,
            accidental: j.accidental,
            solfege: j.solfege().to_string(),
        }
    });
    NoteDto {
        midi: n.midi(),
        name: n.name(),
        name_zh: n.name_zh(),
        letter: n.spelled.letter.name().to_string(),
        accidental: n.spelled.accidental,
        octave: n.octave,
        frequency: n.frequency(),
        degree: jianpu.as_ref().map(|j| j.digit),
        jianpu,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IntervalDto {
    from: NoteDto,
    to: NoteDto,
    degree: u8,
    quality: Quality,
    semitones: i8,
    name_zh: String,
    name_en: String,
    consonance: Consonance,
    consonance_zh: String,
    just_ratio: Option<(u32, u32)>,
    is_tritone: bool,
}

fn consonance_zh(c: Consonance) -> String {
    match c {
        Consonance::Perfect => "完全协和".to_string(),
        Consonance::Imperfect => "不完全协和".to_string(),
        Consonance::Dissonant => "不协和".to_string(),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScaleDto {
    tonic: String,
    tonic_zh: String,
    kind: ScaleKind,
    kind_zh: String,
    notes: Vec<NoteDto>,
    step_labels: Vec<&'static str>,
    degree_names_zh: Option<Vec<&'static str>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChordDto {
    root: NoteDto,
    quality: String,
    quality_zh: String,
    symbol: String,
    semitone_intervals: Vec<i8>,
    notes: Vec<NoteDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiatonicTriadDto {
    degree: u8,
    roman: String,
    jianpu_degree: u8,
    quality: TriadQuality,
    quality_zh: String,
    root: NoteDto,
    notes: Vec<NoteDto>,
}

// ============ 工具 ============

fn parse_spelled(s: &str) -> Result<Spelled, JsValue> {
    Spelled::parse(s).ok_or_else(|| JsValue::from_str(&format!("无法解析音名「{s}」，示例：C、F#、Bb")))
}

fn parse_note(s: &str) -> Result<Note, JsValue> {
    Note::parse(s).ok_or_else(|| JsValue::from_str(&format!("无法解析音符「{s}」，示例：C4、F#3、Bb5")))
}

fn to_js<T: Serialize>(v: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(v)
        .map_err(|e| JsValue::from_str(&format!("序列化失败：{e}")))
}

fn key_context(key: Option<String>, mode: Option<String>) -> Result<Option<(Spelled, ScaleKind)>, JsValue> {
    match key {
        Some(k) => {
            let tonic = parse_spelled(&k)?;
            let kind = match mode {
                Some(m) => ScaleKind::parse(&m)
                    .ok_or_else(|| JsValue::from_str(&format!("未知音阶「{m}」")))?,
                None => ScaleKind::Major,
            };
            Ok(Some((tonic, kind)))
        }
        None => Ok(None),
    }
}

// ============ WASM 接口 ============

/// 查询单个音符（可选调上下文，附带简谱信息）。
#[wasm_bindgen]
pub fn note_info(
    name: &str,
    key: Option<String>,
    mode: Option<String>,
    reference_octave: Option<i8>,
) -> Result<JsValue, JsValue> {
    let n = parse_note(name)?;
    let ctx = key_context(key, mode)?;
    to_js(&note_dto(n, ctx, reference_octave.unwrap_or(n.octave)))
}

/// 两音之间的音程（同八度内的简单音程）。
#[wasm_bindgen]
pub fn interval_between(from: &str, to: &str) -> Result<JsValue, JsValue> {
    let a = parse_note(from)?;
    let b = parse_note(to)?;
    let iv = between(a.spelled, b.spelled);
    let dto = IntervalDto {
        from: note_dto(a, None, a.octave),
        to: note_dto(b, None, b.octave),
        degree: iv.degree,
        quality: iv.quality,
        semitones: iv.semitones(),
        name_zh: iv.name_zh(),
        name_en: iv.name_en(),
        consonance: iv.consonance(),
        consonance_zh: consonance_zh(iv.consonance()),
        just_ratio: iv.just_ratio(),
        is_tritone: iv.is_tritone(),
    };
    to_js(&dto)
}

/// 一个八度的音阶（含结尾主音）。简谱相对主音计算。
#[wasm_bindgen]
pub fn scale(tonic: &str, kind: &str, octave: i8) -> Result<JsValue, JsValue> {
    let t = parse_spelled(tonic)?;
    let k = ScaleKind::parse(kind)
        .ok_or_else(|| JsValue::from_str(&format!("未知音阶「{kind}」：major/naturalMinor/majorPentatonic…")))?;
    let notes = scale_notes(t, k, octave);
    let dto = ScaleDto {
        tonic: t.name(),
        tonic_zh: t.name_zh(),
        kind: k,
        kind_zh: k.name_zh().to_string(),
        notes: notes.iter().map(|n| note_dto(*n, Some((t, k)), octave)).collect(),
        step_labels: step_labels(t, k),
        degree_names_zh: (k == ScaleKind::Major)
            .then(|| scale::MAJOR_DEGREE_NAMES_ZH.to_vec()),
    };
    to_js(&dto)
}

/// 三和弦。quality：major/minor/augmented/diminished。
#[wasm_bindgen]
pub fn triad_chord(root: &str, quality: &str, octave: i8) -> Result<JsValue, JsValue> {
    let r = parse_spelled(root)?;
    let q = TriadQuality::parse(quality)
        .ok_or_else(|| JsValue::from_str(&format!("未知三和弦性质「{quality}」")))?;
    let notes = chord::triad(r, q, octave);
    let root_note = notes[0];
    let intervals = q.intervals();
    let dto = ChordDto {
        root: note_dto(root_note, None, octave),
        quality: format!("{q:?}").to_lowercase(),
        quality_zh: q.name_zh().to_string(),
        symbol: format!("{}{}", r.name(), q.symbol_suffix()),
        semitone_intervals: vec![0, intervals[0], intervals[1]],
        notes: notes.iter().map(|n| note_dto(*n, None, octave)).collect(),
    };
    to_js(&dto)
}

/// 七和弦。quality：dominant/major7/minor7。
#[wasm_bindgen]
pub fn seventh_chord_notes(root: &str, quality: &str, octave: i8) -> Result<JsValue, JsValue> {
    let r = parse_spelled(root)?;
    let q = SeventhQuality::parse(quality)
        .ok_or_else(|| JsValue::from_str(&format!("未知七和弦性质「{quality}」")))?;
    let notes = chord::seventh_chord(r, q, octave);
    let root_note = notes[0];
    let intervals = q.intervals();
    let dto = ChordDto {
        root: note_dto(root_note, None, octave),
        quality: format!("{q:?}").to_lowercase(),
        quality_zh: q.name_zh().to_string(),
        symbol: format!("{}{}", r.name(), if q == SeventhQuality::Dominant { "7" } else { "maj7/m7" }),
        semitone_intervals: vec![0, intervals[0], intervals[1], intervals[2]],
        notes: notes.iter().map(|n| note_dto(*n, None, octave)).collect(),
    };
    to_js(&dto)
}

/// 调内三和弦（级数 + 罗马数字 + 和弦音）。mode：major/naturalMinor。
#[wasm_bindgen]
pub fn diatonic_triads(tonic: &str, mode: &str, octave: i8) -> Result<JsValue, JsValue> {
    let t = parse_spelled(tonic)?;
    let k = ScaleKind::parse(mode)
        .ok_or_else(|| JsValue::from_str(&format!("不支持的模式「{mode}」，仅 major/naturalMinor")))?;
    if !k.is_heptatonic() {
        return Err(JsValue::from_str("调内三和弦只支持七声音阶"));
    }
    let triads = chord::diatonic_triads(t, k, octave);
    let dtos: Vec<DiatonicTriadDto> = triads
        .iter()
        .map(|d| DiatonicTriadDto {
            degree: d.degree,
            roman: d.roman.clone(),
            jianpu_degree: d.jianpu_degree,
            quality: d.quality,
            quality_zh: d.quality.name_zh().to_string(),
            root: note_dto(d.root, Some((t, k)), octave),
            notes: d.notes.iter().map(|n| note_dto(*n, Some((t, k)), octave)).collect(),
        })
        .collect();
    to_js(&dtos)
}

/// 经典和弦进行预设。
#[wasm_bindgen]
pub fn progressions() -> JsValue {
    serde_wasm_bindgen::to_value(&chord::progression_presets())
        .unwrap_or(JsValue::NULL)
}

/// 单音在指定调下的简谱表示。
#[wasm_bindgen]
pub fn jianpu_for_note(
    key: &str,
    mode: Option<String>,
    note: &str,
    reference_octave: i8,
) -> Result<JsValue, JsValue> {
    let k = parse_spelled(key)?;
    let kind = match mode {
        Some(m) => ScaleKind::parse(&m).ok_or_else(|| JsValue::from_str(&format!("未知音阶「{m}」")))?,
        None => ScaleKind::Major,
    };
    let n = parse_note(note)?;
    let j = note_to_jianpu(k, kind, reference_octave, n);
    to_js(&JianpuDto {
        digit: j.digit,
        octave_offset: j.octave_offset,
        accidental: j.accidental,
        solfege: j.solfege().to_string(),
    })
}

/// 白键/黑键与音名对照（第一章教学：键盘结构）。
#[wasm_bindgen]
pub fn keyboard_layout(start_octave: i8, octaves: i8) -> Result<JsValue, JsValue> {
    if octaves < 1 || octaves > 6 {
        return Err(JsValue::from_str("八度数须在 1–6"));
    }
    let mut keys = Vec::new();
    let start_midi = (start_octave + 1) * 12;
    let count = octaves * 12 + 1; // 含结尾 C
    for i in 0..count {
        let midi = start_midi + i;
        let n = Note::from_midi(midi, false);
        // 黑键用相邻白键判断：字母不在自然音级上即为黑键
        let is_black = n.spelled.accidental != 0;
        keys.push(KeyboardKeyDto {
            midi,
            name: n.spelled.name(),
            name_zh: n.spelled.name_zh(),
            octave: n.octave,
            is_black,
            is_natural_c: n.spelled.accidental == 0 && n.spelled.letter == Letter::C,
        });
    }
    to_js(&keys)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct KeyboardKeyDto {
    midi: i8,
    name: String,
    name_zh: String,
    octave: i8,
    is_black: bool,
    is_natural_c: bool,
}

// Interval 结构的公共包装（供测试与其他模块复用）
pub use interval::interval_from;
pub use note::LETTER_NAMES as LETTERS;
