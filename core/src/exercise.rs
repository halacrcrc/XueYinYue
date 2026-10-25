//! 四向练习矩阵出题器（辨认 / 听辨 / 键盘辨认 / 构建）+ 判分。
//! 所有随机性与对错判断都在这里，带单元测试；前端只负责展示与收答案。

use crate::chord::{triad, TriadQuality};
use crate::interval::Interval;
use crate::note::Note;
use crate::scale::{scale_notes, ScaleKind};
use rand::prelude::*;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McOption {
    pub key: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Question {
    /// 'mc'（选择题）| 'build'（钢琴构建题）
    pub kind: String,
    /// 知识点 id（进度/练耳统计用）
    pub topic: String,
    pub prompt: String,
    pub sub_prompt: Option<String>,
    /// mc 的选项
    pub options: Vec<McOption>,
    /// 需要播放的 midi（听辨题）
    pub play: Vec<i8>,
    /// 调性练耳：先播放的和弦序列（每个和弦一组 midi）
    pub cadence: Vec<Vec<i8>>,
    /// 'melody'（先后+同时）| 'chord'（同时）
    pub play_mode: String,
    /// 五线谱显示（VexFlow key，如 "c/4"），空数组则不显示
    pub staff_notes: Vec<String>,
    /// mc：正确选项 key；build：期望 midi 集合（升序逗号串）
    pub answer: String,
    /// 正确答案的展示文案
    pub answer_label: String,
    pub explanation: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult {
    pub correct: bool,
    pub answer_label: String,
    pub explanation: String,
}

// ---------- 题库参数 ----------

/// 入门音程池：半音数 + 中文名。
const INTERVAL_POOL: &[(i8, &str)] = &[
    (1, "小二度"),
    (2, "大二度"),
    (3, "小三度"),
    (4, "大三度"),
    (5, "纯四度"),
    (7, "纯五度"),
    (8, "小六度"),
    (9, "大六度"),
    (10, "小七度"),
    (11, "大七度"),
];

const LETTERS: [&str; 7] = ["C", "D", "E", "F", "G", "A", "B"];
const TRIAD_POOL: &[(TriadQuality, &str)] = &[
    (TriadQuality::Major, "大三和弦"),
    (TriadQuality::Minor, "小三和弦"),
    (TriadQuality::Augmented, "增三和弦"),
    (TriadQuality::Diminished, "减三和弦"),
];
/// 构建题的调性池（大调，覆盖常见升降号）
const BUILD_KEY_POOL: [&str; 8] = ["C", "G", "D", "F", "A", "E", "Bb", "Eb"];

// ---------- 工具 ----------

fn vex_key(n: Note) -> String {
    format!("{}/{}", n.spelled.name().to_lowercase(), n.octave)
}

fn white_midi(rng: &mut impl Rng, lo: i8, hi: i8) -> i8 {
    let whites: Vec<i8> = (lo..=hi)
        .filter(|m| ![1, 3, 6, 8, 10].contains(&(((m % 12) + 12) % 12)))
        .collect();
    whites[rng.gen_range(0..whites.len())]
}

fn pick_options(correct: String, pool: &[String], count: usize, rng: &mut impl Rng) -> Vec<McOption> {
    let mut labels: Vec<String> = pool
        .iter()
        .filter(|l| l.as_str() != correct.as_str())
        .cloned()
        .collect();
    labels.shuffle(rng);
    let mut chosen: Vec<String> = labels.into_iter().take(count - 1).collect();
    chosen.push(correct.clone());
    chosen.shuffle(rng);
    chosen
        .into_iter()
        .enumerate()
        .map(|(i, label)| McOption { key: format!("o{i}"), label })
        .collect()
}

fn mc_answer_key(options: &[McOption], label: &str) -> String {
    options.iter().find(|o| o.label == label).map(|o| o.key.clone()).unwrap_or_default()
}

// ---------- 各题型生成器 ----------

/// 看谱认音名（白键）。
pub fn gen_note_name(rng: &mut impl Rng) -> Question {
    let midi = white_midi(rng, 60, 83);
    let note = Note::from_midi(midi, false);
    let correct = note.spelled.letter.name().to_string();
    let pool: Vec<String> = LETTERS.iter().map(|s| s.to_string()).collect();
    let options = pick_options(correct.clone(), &pool, 4, rng);
    let answer = mc_answer_key(&options, &correct);
    Question {
        kind: "mc".into(),
        topic: "note-name".into(),
        prompt: "这个音的音名是什么？".into(),
        sub_prompt: None,
        options,
        play: vec![midi],
        cadence: vec![],
        play_mode: "melody".into(),
        staff_notes: vec![vex_key(note)],
        answer,
        answer_label: note.name(),
        explanation: format!("这是 {}（第 {} 个八度）。", note.name(), note.octave),
    }
}

/// 看谱认简谱（C 大调语境）。
pub fn gen_jianpu_digit(rng: &mut impl Rng) -> Question {
    let midi = white_midi(rng, 60, 83);
    let note = Note::from_midi(midi, false);
    let digit = (midi - 60).rem_euclid(12);
    let map: [i8; 12] = [1, -1, 2, -1, 3, 4, -1, 5, -1, 6, -1, 7];
    let d = map[digit as usize];
    let correct = d.to_string();
    let pool: Vec<String> = (1..=7).map(|i| i.to_string()).collect();
    let options = pick_options(correct.clone(), &pool, 7, rng);
    let answer = mc_answer_key(&options, &correct);
    Question {
        kind: "mc".into(),
        topic: "jianpu-digit".into(),
        prompt: "在 C 大调里，这个音的简谱数字是几？".into(),
        sub_prompt: None,
        options,
        play: vec![midi],
        cadence: vec![],
        play_mode: "melody".into(),
        staff_notes: vec![vex_key(note)],
        answer,
        answer_label: format!("简谱 {}", d),
        explanation: format!("C 大调中 {} 唱作 {}（do=1）。", note.name(), crate::jianpu::SOLFEGE_ZH[d as usize - 1]),
    }
}

/// 认音程（看 + 可听）。see=true 时显示谱面，false 为纯听辨。
pub fn gen_interval(rng: &mut impl Rng, ear_only: bool) -> Question {
    let root_midi = white_midi(rng, 55, 71);
    let (semi, name_zh) = INTERVAL_POOL[rng.gen_range(0..INTERVAL_POOL.len())];
    let upper_midi = root_midi + semi;
    let root = Note::from_midi(root_midi, false);
    let upper = Note::from_midi(upper_midi, false);
    let correct = name_zh.to_string();
    let pool: Vec<String> = INTERVAL_POOL.iter().map(|(_, n)| n.to_string()).collect();
    let options = pick_options(correct.clone(), &pool, 4, rng);
    let answer = mc_answer_key(&options, &correct);
    // 度数展示（教学补充）
    let iv = crate::interval::between(root.spelled, upper.spelled);
    Question {
        kind: "mc".into(),
        topic: if ear_only { "interval-ear".into() } else { "interval-see".into() },
        prompt: if ear_only { "听这两个音，它们是什么音程？".into() } else { "这两个音之间是什么音程？".into() },
        sub_prompt: None,
        options,
        play: vec![root_midi, upper_midi],
        play_mode: "melody".into(),
        staff_notes: if ear_only { vec![] } else { vec![vex_key(root), vex_key(upper)] },
        answer,
        answer_label: name_zh.to_string(),
        explanation: format!("从 {} 到 {} 是{}（{} 个半音）。", root.name(), upper.name(), name_zh, semi),
        ..Default::default()
    }
    .with_iv_hint(iv)
}

/// 认和弦性质。ear_only 控制是否显示谱面。
pub fn gen_chord(rng: &mut impl Rng, ear_only: bool) -> Question {
    let root_midi = white_midi(rng, 55, 71);
    let (quality, name_zh) = TRIAD_POOL[rng.gen_range(0..TRIAD_POOL.len())];
    let root = Note::from_midi(root_midi, false);
    let notes = triad(root.spelled, quality, root.octave);
    let midis: Vec<i8> = notes.iter().map(|n| n.midi()).collect();
    let correct = name_zh.to_string();
    let pool: Vec<String> = TRIAD_POOL.iter().map(|(_, n)| n.to_string()).collect();
    let options = pick_options(correct.clone(), &pool, 4, rng);
    let answer = mc_answer_key(&options, &correct);
    Question {
        kind: "mc".into(),
        topic: if ear_only { "chord-ear".into() } else { "chord-see".into() },
        prompt: if ear_only { "听这个和弦，它是什么性质？".into() } else { "这个和弦是什么性质？".into() },
        sub_prompt: None,
        options,
        play: midis.clone(),
        play_mode: "chord".into(),
        staff_notes: if ear_only {
            vec![]
        } else {
            notes.iter().map(|n| vex_key(*n)).collect()
        },
        answer,
        answer_label: format!("{}（{}）", root.spelled.name(), name_zh),
        explanation: format!("{} 由 {} 组成，是{}。", root.spelled.name(), notes.iter().map(|n| n.spelled.name()).collect::<Vec<_>>().join("、"), name_zh),
        ..Default::default()
    }
}

/// 构建：在钢琴上弹出指定大调音阶（一个八度，7 个音，结尾高主音可弹可不弹）。
pub fn gen_build_scale(rng: &mut impl Rng) -> Question {
    let tonic = BUILD_KEY_POOL[rng.gen_range(0..BUILD_KEY_POOL.len())];
    let spelled = crate::note::Spelled::parse(tonic).unwrap();
    let notes = scale_notes(spelled, ScaleKind::Major, 4);
    let midis: Vec<i8> = notes[..7].iter().map(|n| n.midi()).collect();
    let tonic_note = notes[0];
    let names: Vec<String> = notes[..7].iter().map(|n| n.spelled.name()).collect();
    Question {
        kind: "build".into(),
        topic: "build-scale".into(),
        prompt: format!("在键盘上弹出 {} 大调音阶（从 {} 开始的 7 个音）", tonic, tonic_note.name()),
        sub_prompt: Some("依次点选琴键，选好后按「检查」。结尾的高八度主音可弹可不弹。".into()),
        options: vec![],
        play: vec![],
        cadence: vec![],
        play_mode: "".into(),
        staff_notes: vec![],
        answer: midis.iter().map(|m| m.to_string()).collect::<Vec<_>>().join(","),
        answer_label: format!("{} 大调：{}", tonic, names.join("、")),
        explanation: format!("全全半全全全半的公式从 {} 推出：{}。", tonic, names.join("、")),
    }
}

/// 构建：在钢琴上弹出指定三和弦。
pub fn gen_build_chord(rng: &mut impl Rng) -> Question {
    let root_midi = white_midi(rng, 55, 71);
    let (quality, name_zh) = TRIAD_POOL[rng.gen_range(0..2)]; // 入门只考大/小
    let root = Note::from_midi(root_midi, false);
    let notes = triad(root.spelled, quality, root.octave);
    let midis: Vec<i8> = notes.iter().map(|n| n.midi()).collect();
    let names: Vec<String> = notes.iter().map(|n| n.spelled.name()).collect();
    Question {
        kind: "build".into(),
        topic: "build-chord".into(),
        prompt: format!("在键盘上弹出 {} {}", root.spelled.name(), name_zh),
        sub_prompt: Some("点选三个琴键，选好后按「检查」。".into()),
        options: vec![],
        play: vec![],
        cadence: vec![],
        play_mode: "".into(),
        staff_notes: vec![],
        answer: midis.iter().map(|m| m.to_string()).collect::<Vec<_>>().join(","),
        answer_label: format!("{}：{}", name_zh, names.join("、")),
        explanation: format!("{} {} 的三个音是 {}。", root.spelled.name(), name_zh, names.join("、")),
    }
}

impl Default for Question {
    fn default() -> Self {
        Question {
            kind: "mc".into(),
            topic: String::new(),
            prompt: String::new(),
            sub_prompt: None,
            options: vec![],
            play: vec![],
            cadence: vec![],
            play_mode: String::new(),
            staff_notes: vec![],
            answer: String::new(),
            answer_label: String::new(),
            explanation: String::new(),
        }
    }
}

/// 调性级数练耳（Functional Ear Trainer 方法）：
/// 先播 I–IV–V–I 建立 C 大调调中心，再播目标音，答它的唱名级数。
pub fn gen_tonal_ear(rng: &mut impl Rng) -> Question {
    let cadence = vec![
        vec![48, 52, 55], // I  C3 E3 G3
        vec![53, 57, 60], // IV  F3 A3 C4
        vec![55, 59, 62], // V   G3 B3 D4
        vec![48, 52, 55], // I
    ];
    // 目标：C4..B4 的白键（60..=71 中的自然音）
    let diatonic: Vec<i8> = [60i8, 62, 64, 65, 67, 69, 71].to_vec();
    let target = diatonic[rng.gen_range(0..diatonic.len())];
    let digit = diatonic.iter().position(|m| *m == target).unwrap() + 1;
    let solfege = crate::jianpu::SOLFEGE_ZH[digit - 1];
    let pool: Vec<String> = crate::jianpu::SOLFEGE_ZH.iter().map(|s| s.to_string()).collect();
    let correct = solfege.to_string();
    let options = pick_options(correct.clone(), &pool, 7, rng);
    let answer = mc_answer_key(&options, &correct);
    Question {
        kind: "mc".into(),
        topic: "tonal-ear".into(),
        prompt: "先听和声确立调中心，再听最后那个音——它是什么唱名？".into(),
        sub_prompt: Some("心里先跟着和声默唱 do，再判断目标音相对 do 的位置。".into()),
        options,
        play: vec![target],
        cadence,
        play_mode: "tonal".into(),
        staff_notes: vec![],
        answer,
        answer_label: format!("{}（简谱 {}）", solfege, digit),
        explanation: format!("在 C 大调里，这个音是 {}，唱作 {}（第 {} 级）。", Note::from_midi(target, false).name(), solfege, digit),
    }
}

impl Question {
    fn with_iv_hint(self, _iv: Interval) -> Question {
        // 预留：在解释中带出度数
        self
    }
}

// ---------- WASM 接口 ----------

#[wasm_bindgen]
pub fn gen_question(kind: &str) -> Result<JsValue, JsValue> {
    let mut rng = thread_rng();
    let q = match kind {
        "note-name" => gen_note_name(&mut rng),
        "jianpu-digit" => gen_jianpu_digit(&mut rng),
        "interval-see" => gen_interval(&mut rng, false),
        "interval-ear" => gen_interval(&mut rng, true),
        "chord-see" => gen_chord(&mut rng, false),
        "chord-ear" => gen_chord(&mut rng, true),
        "build-scale" => gen_build_scale(&mut rng),
        "build-chord" => gen_build_chord(&mut rng),
        "tonal-ear" => gen_tonal_ear(&mut rng),
        other => return Err(JsValue::from_str(&format!("未知题型「{other}」"))),
    };
    serde_wasm_bindgen::to_value(&q).map_err(|e| JsValue::from_str(&format!("序列化失败：{e}")))
}

/// 判分。answer：mc 为选项 key；build 为逗号分隔 midi。
#[wasm_bindgen]
pub fn check_answer(question: JsValue, answer: String) -> Result<JsValue, JsValue> {
    let q: Question = serde_wasm_bindgen::from_value(question)
        .map_err(|e| JsValue::from_str(&format!("题目反序列化失败：{e}")))?;
    let correct = if q.kind == "build" {
        check_build(&q.answer, &answer)
    } else {
        q.answer == answer
    };
    let result = CheckResult {
        correct,
        answer_label: q.answer_label,
        explanation: q.explanation,
    };
    serde_wasm_bindgen::to_value(&result).map_err(|e| JsValue::from_str(&format!("序列化失败：{e}")))
}

fn parse_midi_set(s: &str) -> Vec<i8> {
    let mut v: Vec<i8> = s
        .split(',')
        .filter_map(|t| t.trim().parse().ok())
        .collect();
    v.sort_unstable();
    v.dedup();
    v
}

fn check_build(expected: &str, user: &str) -> bool {
    let exp = parse_midi_set(expected);
    let usr = parse_midi_set(user);
    if usr == exp {
        return true;
    }
    // 音阶题：允许补弹结尾高八度主音
    let mut exp8 = exp.clone();
    if let Some(first) = exp.first() {
        exp8.push(first + 12);
        exp8.sort_unstable();
        exp8.dedup();
    }
    usr == exp || usr == exp8
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::rngs::StdRng;

    #[test]
    fn note_name_sanity() {
        let mut rng = StdRng::seed_from_u64(42);
        for _ in 0..50 {
            let q = gen_note_name(&mut rng);
            assert_eq!(q.options.len(), 4);
            assert!(q.options.iter().any(|o| o.key == q.answer));
            // 选项不重复
            let mut labels: Vec<_> = q.options.iter().map(|o| o.label.clone()).collect();
            labels.sort();
            labels.dedup();
            assert_eq!(labels.len(), 4);
        }
    }

    #[test]
    fn jianpu_digit_matches_degree() {
        let mut rng = StdRng::seed_from_u64(7);
        for _ in 0..50 {
            let q = gen_jianpu_digit(&mut rng);
            assert_eq!(q.options.len(), 7);
            // 白键 midi 必在 60..=83
            let m = q.play[0];
            assert!((60..=83).contains(&m));
            assert!(![1, 3, 6, 8, 10].contains(&(((m % 12) + 12) % 12)));
        }
    }

    #[test]
    fn interval_upper_distance() {
        let mut rng = StdRng::seed_from_u64(3);
        for _ in 0..80 {
            let q = gen_interval(&mut rng, false);
            assert_eq!(q.play.len(), 2);
            assert!(q.play[1] > q.play[0]);
            assert!((q.play[1] - q.play[0]) <= 11);
            assert!(!q.staff_notes.is_empty());
        }
        let mut rng = StdRng::seed_from_u64(4);
        for _ in 0..20 {
            let q = gen_interval(&mut rng, true);
            assert!(q.staff_notes.is_empty(), "听辨题不应显示谱面");
        }
    }

    #[test]
    fn chord_generation() {
        let mut rng = StdRng::seed_from_u64(9);
        for _ in 0..80 {
            let q = gen_chord(&mut rng, false);
            assert_eq!(q.play.len(), 3);
            // 三和弦音程结构 4/3、3/4、4/4、3/3
            let d1 = q.play[1] - q.play[0];
            let d2 = q.play[2] - q.play[1];
            assert!(
                [(3, 3), (3, 4), (4, 3), (4, 4)].contains(&(d1, d2)),
                "和弦 {:?} label={} staff={:?} 结构异常 d1={} d2={}",
                q.play,
                q.answer_label,
                q.staff_notes,
                d1,
                d2
            );
        }
    }

    #[test]
    fn build_scale_check() {
        let mut rng = StdRng::seed_from_u64(11);
        let q = gen_build_scale(&mut rng);
        let expected: Vec<i8> = q.answer.split(',').map(|s| s.parse().unwrap()).collect();
        // 完全正确
        let user = expected.iter().map(|m| m.to_string()).collect::<Vec<_>>().join(",");
        assert!(check_build(&q.answer, &user));
        // 补了高八度主音也算对
        let mut with_oct = expected.clone();
        with_oct.push(expected[0] + 12);
        let user2 = with_oct.iter().map(|m| m.to_string()).collect::<Vec<_>>().join(",");
        assert!(check_build(&q.answer, &user2));
        // 少一个音不对
        let short = &expected[..6];
        let user3 = short.iter().map(|m| m.to_string()).collect::<Vec<_>>().join(",");
        assert!(!check_build(&q.answer, &user3));
    }

    #[test]
    fn build_chord_check() {
        let mut rng = StdRng::seed_from_u64(13);
        let q = gen_build_chord(&mut rng);
        let expected: Vec<i8> = q.answer.split(',').map(|s| s.parse().unwrap()).collect();
        assert_eq!(expected.len(), 3);
        // 乱序作答也应对（集合比较）
        let shuffled = format!("{},{},{}", expected[2], expected[0], expected[1]);
        assert!(check_build(&q.answer, &shuffled));
    }

    #[test]
    fn build_chord_only_major_minor() {
        let mut rng = StdRng::seed_from_u64(21);
        for _ in 0..50 {
            let q = gen_build_chord(&mut rng);
            assert!(
                q.prompt.contains("大三和弦") || q.prompt.contains("小三和弦"),
                "入门构建题只考大/小三和弦：{}",
                q.prompt
            );
        }
    }
}
