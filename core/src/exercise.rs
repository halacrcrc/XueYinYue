//! 四向练习矩阵出题器（辨认 / 听辨 / 键盘辨认 / 构建）+ 判分。
//! 所有随机性与对错判断都在这里，带单元测试；前端只负责展示与收答案。

use crate::chord::{diatonic_triads, triad, TriadQuality};
use crate::interval::Interval;
use crate::note::Note;
use crate::scale::{scale_notes, ScaleKind};
use rand::prelude::*;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McOption {
    pub key: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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

/// 进行听辨的四选一：(起始级数, 目标级数, 选项文案)。key/answer 存级数对（如 "1-5"）。
const PROGRESSION_EAR_POOL: &[(u8, u8, &str)] = &[
    (1, 5, "1 → 5"),
    (1, 4, "1 → 4"),
    (1, 6, "1 → 6m"),
    (5, 1, "5 → 1"),
];

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
/// 先播所选大调的 I–IV–V–I 建立调中心，再播目标音，答它的唱名级数。
/// tonic：大调主音拼写（"C"/"G"/"F"/"Bb"…），解析失败回退 C 大调。
///
/// 唱名/级数与调无关——target 音级由 `scale_notes(主音)` 给出，选项与判分机制不变，
/// 只有 cadence 和弦与目标音的音高随调移动；解释文案报真实调性与音名。
pub fn gen_tonal_ear_in_key(rng: &mut impl Rng, tonic: &str) -> Question {
    let spelled = crate::note::Spelled::parse(tonic)
        .unwrap_or_else(|| crate::note::Spelled::natural(crate::note::Letter::C));
    // 和弦音区：主音半音位 > 7（如 Bb）时 cadence 下移一个八度，
    // 让 C/G/F/Bb 四种调的 I–IV–V–I 落在同一音区附近
    let base_octave = if spelled.semitone() > 7 { 2 } else { 3 };
    // 调内三和弦（根音八度 = base_octave），取 I / IV / V / I
    let triads = crate::chord::diatonic_triads(spelled, ScaleKind::Major, base_octave);
    let chord = |deg: usize| -> Vec<i8> { triads[deg].notes.iter().map(|n| n.midi()).collect() };
    let cadence = vec![chord(0), chord(3), chord(4), chord(0)];
    // 目标音：主音上方一个八度内的 7 个音级（比和弦区高八度，听感分明）
    let scale = scale_notes(spelled, ScaleKind::Major, base_octave + 1);
    let idx = rng.gen_range(0..7usize);
    let target_note = scale[idx];
    let digit = idx + 1;
    let solfege = crate::jianpu::SOLFEGE_ZH[digit - 1];
    let pool: Vec<String> = crate::jianpu::SOLFEGE_ZH.iter().map(|s| s.to_string()).collect();
    let correct = solfege.to_string();
    let options = pick_options(correct.clone(), &pool, 7, rng);
    let answer = mc_answer_key(&options, &correct);
    Question {
        kind: "mc".into(),
        topic: "tonal-ear".into(),
        prompt: "先听和声确立调中心，再听最后那个音——它是什么唱名？".into(),
        sub_prompt: Some(format!(
            "已选 {} 大调：心里先跟着和声默唱 do，再判断目标音相对 do 的位置。",
            spelled.name()
        )),
        options,
        play: vec![target_note.midi()],
        cadence,
        play_mode: "tonal".into(),
        staff_notes: vec![],
        answer,
        answer_label: format!("{}（简谱 {}）", solfege, digit),
        explanation: format!(
            "在 {} 大调里，这个音是 {}，唱作 {}（第 {} 级）。",
            spelled.name(),
            target_note.name(),
            solfege,
            digit
        ),
    }
}

/// 兼容入口：C 大调（与历史行为完全一致，gen_question("tonal-ear") 走这里）。
pub fn gen_tonal_ear(rng: &mut impl Rng) -> Question {
    gen_tonal_ear_in_key(rng, "C")
}

impl Question {
    fn with_iv_hint(self, _iv: Interval) -> Question {
        // 预留：在解释中带出度数
        self
    }
}

// ---------- 新题型：大小调听辨 / 进行听辨 / 旋律听辨 ----------

/// 大小调听辨：随机主音上播大调或自然小调音阶的前 5 音（scale_notes 生成，
/// 拼写由 letter_steps 保证），答「大调 / 小调」。
pub fn gen_key_mode(rng: &mut impl Rng) -> Question {
    let tonic = BUILD_KEY_POOL[rng.gen_range(0..BUILD_KEY_POOL.len())];
    let spelled = crate::note::Spelled::parse(tonic).unwrap();
    let is_major = rng.gen_bool(0.5);
    let kind = if is_major { ScaleKind::Major } else { ScaleKind::NaturalMinor };
    let notes = scale_notes(spelled, kind, 4);
    let play: Vec<i8> = notes[..5].iter().map(|n| n.midi()).collect();
    let correct = if is_major { "大调" } else { "小调" }.to_string();
    let pool: Vec<String> = vec!["大调".into(), "小调".into()];
    let options = pick_options(correct.clone(), &pool, 2, rng);
    let answer = mc_answer_key(&options, &correct);
    let first_five: Vec<String> = notes[..5].iter().map(|n| n.spelled.name()).collect();
    let third = notes[2];
    Question {
        kind: "mc".into(),
        topic: "key-mode".into(),
        prompt: "听这条旋律片段，它是大调还是小调？".into(),
        sub_prompt: Some("留意第 3 个音与主音的距离：大三度偏明亮，小三度偏暗淡。".into()),
        options,
        play,
        cadence: vec![],
        play_mode: "melody".into(),
        staff_notes: vec![],
        answer,
        answer_label: format!("{}（{}）", correct, kind.name_zh()),
        explanation: format!(
            "这条旋律从 {} 开始：{}。第 3 个音 {} 与主音相距{}，是{}色彩。",
            tonic,
            first_five.join("、"),
            third.spelled.name(),
            if is_major { "大三度" } else { "小三度" },
            correct
        ),
    }
}

/// 进行听辨的教学短注（按级数对）。
fn progression_blurb(d1: u8, d2: u8) -> &'static str {
    match (d1, d2) {
        (1, 5) => "主和弦走向属和弦，最有向前的推动力，常停在乐句中间吊住耳朵。",
        (1, 4) => "主和弦走向下属和弦，色彩豁然变宽，常用来展开新乐句。",
        (1, 6) => "主和弦走向关系小调，瞬间转暗、变抒情。",
        (5, 1) => "属和弦解决回主和弦，最经典的「回家」终止。",
        _ => "",
    }
}

/// 进行听辨：播 C 大调调内三和弦（diatonic_triads）的两个和弦，
/// 四选一（1→5 / 1→4 / 1→6m / 5→1）；answer 与选项 key 都存级数对（如 "1-5"）。
pub fn gen_progression_ear(rng: &mut impl Rng) -> Question {
    let idx = rng.gen_range(0..PROGRESSION_EAR_POOL.len());
    let (d1, d2, label) = PROGRESSION_EAR_POOL[idx];
    let triads = diatonic_triads(crate::note::Spelled::parse("C").unwrap(), ScaleKind::Major, 3);
    let chord = |deg: u8| -> Vec<i8> { triads[(deg - 1) as usize].notes.iter().map(|n| n.midi()).collect() };
    let c1 = chord(d1);
    let c2 = chord(d2);
    // 选项固定四选一；key 直接存级数对，answer 与之同构
    let mut options: Vec<McOption> = PROGRESSION_EAR_POOL
        .iter()
        .map(|(a, b, l)| McOption { key: format!("{}-{}", a, b), label: l.to_string() })
        .collect();
    options.shuffle(rng);
    let answer = format!("{}-{}", d1, d2);
    let chord_symbol = |deg: u8| -> String {
        let t = &triads[(deg - 1) as usize];
        format!("{}{}", t.root.spelled.name(), if t.quality == TriadQuality::Minor { "m" } else { "" })
    };
    Question {
        kind: "mc".into(),
        topic: "progression-ear".into(),
        prompt: "听这两个和弦的进行，它是哪一种？".into(),
        sub_prompt: Some("两个和弦先后响起；感受第二个和弦相对第一个的「稳定 / 推动」关系。".into()),
        options,
        play: vec![],
        cadence: vec![c1, c2],
        play_mode: "progression".into(),
        staff_notes: vec![],
        answer,
        answer_label: format!("{}（{} → {}）", label, chord_symbol(d1), chord_symbol(d2)),
        explanation: format!(
            "进行是 {} → {}：{} 和 {}。{}",
            d1,
            d2,
            chord_symbol(d1),
            chord_symbol(d2),
            progression_blurb(d1, d2)
        ),
    }
}

/// C 大调白键 midi（60..=71）→ 简谱数字；黑键返回 None。
fn c_major_digit(midi: i8) -> Option<u8> {
    let map: [i8; 12] = [1, -1, 2, -1, 3, 4, -1, 5, -1, 6, -1, 7];
    let d = map[(((midi % 12) + 12) % 12) as usize];
    (d >= 0).then_some(d as u8)
}

/// 旋律听辨（简单方案）：3 个音的短句（C 大调白键 60..=71，可含重复音），
/// 三选一选简谱数字组；干扰项由正确答案改 1–2 位生成，答对后前端重播确认。
pub fn gen_melody_ear(rng: &mut impl Rng) -> Question {
    let first = white_midi(rng, 60, 71);
    let mut mel: Vec<i8> = vec![first];
    for _ in 0..2 {
        // 后续音落在前一个音的上下纯四度内（±5 半音窗口），可重复
        let prev = *mel.last().unwrap();
        let lo = (prev - 5).max(60);
        let hi = (prev + 5).min(71);
        mel.push(white_midi(rng, lo, hi));
    }
    let digits: Vec<u8> = mel.iter().map(|m| c_major_digit(*m).expect("旋律听辨只生成白键")).collect();
    let correct = digits.iter().map(|d| d.to_string()).collect::<Vec<_>>().join(" ");
    // 干扰项：改动 1–2 位数字，与已有选项去重
    let mut labels: Vec<String> = vec![correct.clone()];
    let mut attempts = 0;
    while labels.len() < 3 && attempts < 200 {
        attempts += 1;
        let mut cand = digits.clone();
        let n_change = if rng.gen_bool(0.5) { 1 } else { 2 };
        let mut positions: Vec<usize> = (0..digits.len()).collect();
        positions.shuffle(rng);
        for &p in positions.iter().take(n_change) {
            let mut d = rng.gen_range(1..=7);
            while d == cand[p] {
                d = rng.gen_range(1..=7);
            }
            cand[p] = d;
        }
        let s = cand.iter().map(|d| d.to_string()).collect::<Vec<_>>().join(" ");
        if !labels.contains(&s) {
            labels.push(s);
        }
    }
    // 兜底：穷举补齐（理论到不了这里）
    if labels.len() < 3 {
        'outer: for a in 1..=7 {
            for b in 1..=7 {
                for c in 1..=7 {
                    let s = format!("{} {} {}", a, b, c);
                    if !labels.contains(&s) {
                        labels.push(s);
                        if labels.len() >= 3 {
                            break 'outer;
                        }
                    }
                }
            }
        }
    }
    labels.shuffle(rng);
    let options: Vec<McOption> = labels
        .into_iter()
        .map(|l| McOption { key: l.clone(), label: l })
        .collect();
    let answer = correct.clone();
    let note_names: Vec<String> = mel.iter().map(|m| Note::from_midi(*m, false).name()).collect();
    Question {
        kind: "mc".into(),
        topic: "melody-ear".into(),
        prompt: "听这三个音的短句，选出它的简谱。".into(),
        sub_prompt: Some("音都在 C 大调 do–si 之内，可能包含重复音；答对后会重播确认。".into()),
        options,
        play: mel,
        cadence: vec![],
        play_mode: "melody".into(),
        staff_notes: vec![],
        answer,
        answer_label: format!("简谱 {}", correct),
        explanation: format!("这三个音是 {}（简谱 {}）。", note_names.join("、"), correct),
    }
}

// ---------- WASM 接口 ----------

fn gen_question_impl(kind: &str, tonic: Option<&str>) -> Result<JsValue, JsValue> {
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
        "tonal-ear" => match tonic {
            Some(t) => gen_tonal_ear_in_key(&mut rng, t),
            None => gen_tonal_ear(&mut rng),
        },
        "key-mode" => gen_key_mode(&mut rng),
        "progression-ear" => gen_progression_ear(&mut rng),
        "melody-ear" => gen_melody_ear(&mut rng),
        other => return Err(JsValue::from_str(&format!("未知题型「{other}」"))),
    };
    serde_wasm_bindgen::to_value(&q).map_err(|e| JsValue::from_str(&format!("序列化失败：{e}")))
}

#[wasm_bindgen]
pub fn gen_question(kind: &str) -> Result<JsValue, JsValue> {
    gen_question_impl(kind, None)
}

/// 指定调性出题：目前 tonal-ear（调性级数）支持主音参数（"C"/"G"/"F"/"Bb"…），
/// 其余题型本身无调性概念，忽略该参数（行为与 gen_question 一致），
/// 前端可对全部题型统一调用。
#[wasm_bindgen]
pub fn gen_question_in_key(kind: &str, tonic: &str) -> Result<JsValue, JsValue> {
    gen_question_impl(kind, Some(tonic))
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

    fn option_labels(q: &Question) -> Vec<String> {
        q.options.iter().map(|o| o.label.clone()).collect()
    }

    // ---------- 大小调听辨 ----------

    #[test]
    fn key_mode_structure() {
        let mut rng = StdRng::seed_from_u64(31);
        for _ in 0..50 {
            let q = gen_key_mode(&mut rng);
            assert_eq!(q.topic, "key-mode");
            // 二选一：大调 / 小调（排序后 大调 在前）
            let mut labels = option_labels(&q);
            labels.sort();
            assert_eq!(labels, vec!["大调".to_string(), "小调".to_string()]);
            // 答案在选项中且 key 唯一
            assert_eq!(q.options.iter().filter(|o| o.key == q.answer).count(), 1);
            // 恰好 5 个音、严格上行、跨度 = 纯五度
            assert_eq!(q.play.len(), 5);
            assert!(q.play.windows(2).all(|w| w[1] > w[0]));
            assert_eq!(q.play[4] - q.play[0], 7);
            // 必须等于主音池中某个（主音 × 大/自然小调）音阶的前 5 音（拼写由 scale_notes 保证）
            let is_known: bool = BUILD_KEY_POOL.iter().any(|t| {
                let sp = crate::note::Spelled::parse(t).unwrap();
                [ScaleKind::Major, ScaleKind::NaturalMinor].iter().any(|k| {
                    let expect: Vec<i8> = scale_notes(sp, *k, 4)[..5].iter().map(|n| n.midi()).collect();
                    expect == q.play
                })
            });
            assert!(is_known, "play={:?} 不属于任何主音池音阶的前五音", q.play);
            // 听辨题不给谱面
            assert!(q.staff_notes.is_empty());
        }
    }

    #[test]
    fn key_mode_answer_matches_mode() {
        let mut rng = StdRng::seed_from_u64(32);
        let mut seen_major = false;
        let mut seen_minor = false;
        for _ in 0..60 {
            let q = gen_key_mode(&mut rng);
            // 由播放内容反推真实调式：相对主音半音 {0,2,4,5,7}=大调，{0,2,3,5,7}=自然小调
            let rel: Vec<i8> = q.play.iter().map(|m| m - q.play[0]).collect();
            let is_major = rel == [0, 2, 4, 5, 7];
            let is_minor = rel == [0, 2, 3, 5, 7];
            assert!(is_major || is_minor, "play={:?} 不是大/小调前五音", q.play);
            let correct_label = &q.options.iter().find(|o| o.key == q.answer).unwrap().label;
            assert_eq!(correct_label, if is_major { "大调" } else { "小调" });
            // 干扰项确实不同
            let wrong = q.options.iter().find(|o| o.key != q.answer).unwrap();
            assert_ne!(wrong.label, *correct_label);
            if is_major {
                seen_major = true;
            } else {
                seen_minor = true;
            }
        }
        assert!(seen_major && seen_minor, "60 题应覆盖两种调式");
    }

    #[test]
    fn key_mode_tonic_variety() {
        let mut rng = StdRng::seed_from_u64(34);
        let mut tonics = std::collections::HashSet::new();
        for _ in 0..80 {
            let q = gen_key_mode(&mut rng);
            tonics.insert(((q.play[0] % 12) + 12) % 12);
        }
        assert!(tonics.len() >= 4, "随机主音池应覆盖多个主音，实际 {:?}", tonics);
    }

    // ---------- 进行听辨 ----------

    #[test]
    fn progression_ear_structure() {
        let mut rng = StdRng::seed_from_u64(41);
        for _ in 0..50 {
            let q = gen_progression_ear(&mut rng);
            assert_eq!(q.topic, "progression-ear");
            assert_eq!(q.options.len(), 4);
            assert_eq!(q.cadence.len(), 2, "应播两个和弦");
            assert_eq!(q.play_mode, "progression");
            assert!(q.cadence.iter().all(|c| c.len() == 3), "每个和弦 3 个音");
            // 选项互不重复、答案在选项中
            let mut keys: Vec<_> = q.options.iter().map(|o| o.key.clone()).collect();
            keys.sort();
            keys.dedup();
            assert_eq!(keys.len(), 4);
            assert!(q.options.iter().any(|o| o.key == q.answer));
            // key 都是合法级数对
            for k in keys {
                assert!(["1-5", "1-4", "1-6", "5-1"].contains(&k.as_str()), "非法级数对 {}", k);
            }
        }
    }

    #[test]
    fn progression_ear_answer_matches_chords() {
        let mut rng = StdRng::seed_from_u64(42);
        for _ in 0..50 {
            let q = gen_progression_ear(&mut rng);
            // 由和弦根音 midi 反推 C 大调级数，校验 answer 与级数对一致
            let pc_deg = |m: i8| match ((m % 12) + 12) % 12 {
                0 => 1,
                2 => 2,
                4 => 3,
                5 => 4,
                7 => 5,
                9 => 6,
                11 => 7,
                _ => 0,
            };
            let d1 = pc_deg(q.cadence[0][0]);
            let d2 = pc_deg(q.cadence[1][0]);
            assert!((1..=7).contains(&d1) && (1..=7).contains(&d2), "根音非 C 大调调内音");
            assert_eq!(q.answer, format!("{}-{}", d1, d2), "answer 应存级数对");
            // 根音为和弦最低音（原位）
            assert!(q.cadence[0][0] <= q.cadence[0][1] && q.cadence[0][1] <= q.cadence[0][2]);
            assert!(q.cadence[1][0] <= q.cadence[1][1] && q.cadence[1][1] <= q.cadence[1][2]);
        }
    }

    #[test]
    fn progression_ear_covers_all_choices() {
        let mut rng = StdRng::seed_from_u64(43);
        let mut seen = std::collections::HashSet::new();
        for _ in 0..100 {
            let q = gen_progression_ear(&mut rng);
            seen.insert(q.answer.clone());
        }
        assert_eq!(seen.len(), 4, "四种进行都应出现，实际 {:?}", seen);
    }

    // ---------- 旋律听辨 ----------

    #[test]
    fn melody_ear_structure() {
        let mut rng = StdRng::seed_from_u64(51);
        for _ in 0..50 {
            let q = gen_melody_ear(&mut rng);
            assert_eq!(q.topic, "melody-ear");
            assert_eq!(q.play.len(), 3);
            assert_eq!(q.options.len(), 3);
            // 全部白键、在 C4..B4（60..=71），无八度点歧义
            for m in &q.play {
                assert!((60..=71).contains(m), "midi {} 超出范围", m);
                assert!(![1, 3, 6, 8, 10].contains(&(((m % 12) + 12) % 12)), "midi {} 非白键", m);
            }
            // 选项标签互不相同、答案在选项中
            let mut labels = option_labels(&q);
            labels.sort();
            labels.dedup();
            assert_eq!(labels.len(), 3);
            assert!(q.options.iter().any(|o| o.key == q.answer));
        }
    }

    #[test]
    fn melody_ear_correct_option_matches_notes() {
        let mut rng = StdRng::seed_from_u64(52);
        for _ in 0..50 {
            let q = gen_melody_ear(&mut rng);
            let map: [i8; 12] = [1, -1, 2, -1, 3, 4, -1, 5, -1, 6, -1, 7];
            let expected: String = q
                .play
                .iter()
                .map(|m| map[(((m % 12) + 12) % 12) as usize].to_string())
                .collect::<Vec<_>>()
                .join(" ");
            let correct_label = &q.options.iter().find(|o| o.key == q.answer).unwrap().label;
            assert_eq!(*correct_label, expected, "正确选项应为播放旋律的简谱");
            // 干扰项与正确项、彼此都不同
            assert_eq!(q.options.iter().filter(|o| o.label == *correct_label).count(), 1);
        }
    }

    #[test]
    fn melody_ear_repeats_and_contour() {
        let mut rng = StdRng::seed_from_u64(53);
        let mut has_repeat = false;
        for _ in 0..60 {
            let q = gen_melody_ear(&mut rng);
            // 跨度受控（首尾不超过一个八度）
            assert!((q.play[2] - q.play[0]).abs() <= 10, "play={:?} 跨度过大", q.play);
            // 生成规则允许重复音，60 题中应实际出现
            if q.play.windows(2).any(|w| w[0] == w[1]) {
                has_repeat = true;
            }
        }
        assert!(has_repeat, "60 题中应出现含重复音的旋律");
    }

    // ---------- 调性级数（可选调性） ----------

    #[test]
    fn tonal_ear_c_matches_legacy_cadence() {
        // 防回归：默认入口必须与历史硬编码的 C 大调 cadence / 目标音区完全一致
        let mut rng = StdRng::seed_from_u64(61);
        for _ in 0..20 {
            let q = gen_tonal_ear(&mut rng);
            assert_eq!(
                q.cadence,
                vec![vec![48, 52, 55], vec![53, 57, 60], vec![55, 59, 62], vec![48, 52, 55]]
            );
            let m = q.play[0];
            assert!((60..=71).contains(&m), "C 大调目标音应在 C4..B4：{}", m);
            assert!(![1, 3, 6, 8, 10].contains(&(((m % 12) + 12) % 12)), "目标音应为白键：{}", m);
        }
    }

    #[test]
    fn tonal_ear_same_seed_same_question_across_entry_points() {
        let mut r1 = StdRng::seed_from_u64(65);
        let mut r2 = StdRng::seed_from_u64(65);
        assert_eq!(
            gen_tonal_ear(&mut r1),
            gen_tonal_ear_in_key(&mut r2, "C"),
            "gen_tonal_ear 应等价于 in_key(\"C\")"
        );
    }

    #[test]
    fn tonal_ear_in_key_cadence_is_i_iv_v_i() {
        let mut rng = StdRng::seed_from_u64(62);
        let pc = |m: i8| -> u8 { m.rem_euclid(12) as u8 };
        for tonic in ["C", "G", "F", "Bb"] {
            let tonic_pc = crate::note::Spelled::parse(tonic).unwrap().semitone() as u8;
            for _ in 0..30 {
                let q = gen_tonal_ear_in_key(&mut rng, tonic);
                assert_eq!(q.play_mode, "tonal");
                assert_eq!(q.cadence.len(), 4, "I–IV–V–I 共 4 个和弦");
                for c in &q.cadence {
                    assert_eq!(c.len(), 3, "每个和弦 3 个音：{:?}", c);
                    assert!(c[0] <= c[1] && c[1] <= c[2], "和弦应原位（根音最低）：{:?}", c);
                }
                assert_eq!(pc(q.cadence[0][0]), tonic_pc, "I 级根音 = 主音（{}）", tonic);
                assert_eq!(pc(q.cadence[1][0]), (tonic_pc + 5) % 12, "IV 级根音（{}）", tonic);
                assert_eq!(pc(q.cadence[2][0]), (tonic_pc + 7) % 12, "V 级根音（{}）", tonic);
                assert_eq!(pc(q.cadence[3][0]), tonic_pc, "收束回 I 级（{}）", tonic);
                // 目标音在上方八度，不与 cadence 低音区混叠
                assert!(q.play[0] >= q.cadence[0][0] + 12, "play={} 应高于和弦区", q.play[0]);
            }
        }
    }

    #[test]
    fn tonal_ear_in_key_target_is_scale_degree() {
        let mut rng = StdRng::seed_from_u64(63);
        for tonic in ["C", "G", "F", "Bb"] {
            let sp = crate::note::Spelled::parse(tonic).unwrap();
            let base = if sp.semitone() > 7 { 2 } else { 3 };
            let degrees: Vec<Note> = scale_notes(sp, ScaleKind::Major, base + 1)[..7].to_vec();
            let mut seen = std::collections::HashSet::new();
            for _ in 0..80 {
                let q = gen_tonal_ear_in_key(&mut rng, tonic);
                let idx = degrees
                    .iter()
                    .position(|n| n.midi() == q.play[0])
                    .unwrap_or_else(|| panic!("{}：目标音 {} 不在所选大调音级内", tonic, q.play[0]));
                let correct = q.options.iter().find(|o| o.key == q.answer).unwrap();
                assert_eq!(correct.label, crate::jianpu::SOLFEGE_ZH[idx], "正确选项 = 目标音级唱名");
                assert_eq!(
                    q.answer_label,
                    format!("{}（简谱 {}）", crate::jianpu::SOLFEGE_ZH[idx], idx + 1)
                );
                seen.insert(q.play[0]);
            }
            assert!(seen.len() >= 5, "{}：80 题应覆盖多数音级，实际 {} 种", tonic, seen.len());
        }
    }

    #[test]
    fn tonal_ear_in_key_explanation_names_key_and_note() {
        let mut rng = StdRng::seed_from_u64(64);
        for tonic in ["G", "F", "Bb"] {
            let sp = crate::note::Spelled::parse(tonic).unwrap();
            for _ in 0..10 {
                let q = gen_tonal_ear_in_key(&mut rng, tonic);
                assert!(
                    q.explanation.contains(&format!("在 {} 大调里", sp.name())),
                    "解释应报真实调性：{}",
                    q.explanation
                );
                assert!(q.sub_prompt.as_deref().unwrap_or_default().contains(tonic));
            }
        }
    }

    #[test]
    fn tonal_ear_in_key_options_structure() {
        let mut rng = StdRng::seed_from_u64(67);
        for tonic in ["C", "G", "F", "Bb"] {
            for _ in 0..10 {
                let q = gen_tonal_ear_in_key(&mut rng, tonic);
                assert_eq!(q.options.len(), 7, "七选一唱名");
                let mut labels: Vec<_> = q.options.iter().map(|o| o.label.clone()).collect();
                labels.sort();
                labels.dedup();
                assert_eq!(labels.len(), 7, "选项互不重复");
                assert_eq!(q.options.iter().filter(|o| o.key == q.answer).count(), 1);
            }
        }
    }

    #[test]
    fn tonal_ear_invalid_tonic_falls_back_to_c() {
        let mut rng = StdRng::seed_from_u64(66);
        let q = gen_tonal_ear_in_key(&mut rng, "H");
        assert_eq!(q.cadence[0], vec![48, 52, 55], "非法主音回退 C 大调");
    }
}
