//! 和弦：三和弦（大/小/增/减）、七和弦、转位、调内三和弦（级数）、经典进行。

use crate::note::{Letter, Note, Spelled};
use crate::scale::{scale_notes, ScaleKind};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TriadQuality {
    Major,
    Minor,
    Augmented,
    Diminished,
}

impl TriadQuality {
    /// 根音之上的半音结构。
    pub fn intervals(&self) -> [i8; 2] {
        match self {
            TriadQuality::Major => [4, 7],
            TriadQuality::Minor => [3, 7],
            TriadQuality::Augmented => [4, 8],
            TriadQuality::Diminished => [3, 6],
        }
    }

    pub fn name_zh(&self) -> &'static str {
        match self {
            TriadQuality::Major => "大三和弦",
            TriadQuality::Minor => "小三和弦",
            TriadQuality::Augmented => "增三和弦",
            TriadQuality::Diminished => "减三和弦",
        }
    }

    /// 常见标记（C 为例）。
    pub fn symbol_suffix(&self) -> &'static str {
        match self {
            TriadQuality::Major => "",
            TriadQuality::Minor => "m",
            TriadQuality::Augmented => "aug",
            TriadQuality::Diminished => "dim",
        }
    }

    /// 由三音的半音结构推断性质（用于调内三和弦推导）。
    pub fn from_stacked_thirds(third: i8, fifth: i8) -> Option<TriadQuality> {
        Some(match (third, fifth) {
            (4, 7) => TriadQuality::Major,
            (3, 7) => TriadQuality::Minor,
            (4, 8) => TriadQuality::Augmented,
            (3, 6) => TriadQuality::Diminished,
            _ => return None,
        })
    }

    pub fn parse(s: &str) -> Option<TriadQuality> {
        let s = s.trim().to_ascii_lowercase();
        Some(match s.as_str() {
            "major" | "maj" | "" => TriadQuality::Major,
            "minor" | "min" | "m" => TriadQuality::Minor,
            "augmented" | "aug" => TriadQuality::Augmented,
            "diminished" | "dim" => TriadQuality::Diminished,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SeventhQuality {
    Dominant,
    Major7,
    Minor7,
}

impl SeventhQuality {
    pub fn intervals(&self) -> [i8; 3] {
        match self {
            SeventhQuality::Dominant => [4, 7, 10],
            SeventhQuality::Major7 => [4, 7, 11],
            SeventhQuality::Minor7 => [3, 7, 10],
        }
    }

    pub fn name_zh(&self) -> &'static str {
        match self {
            SeventhQuality::Dominant => "属七和弦",
            SeventhQuality::Major7 => "大七和弦",
            SeventhQuality::Minor7 => "小七和弦",
        }
    }

    pub fn parse(s: &str) -> Option<SeventhQuality> {
        let s = s.trim().to_ascii_lowercase();
        Some(match s.as_str() {
            "dominant" | "dom7" | "7" => SeventhQuality::Dominant,
            "major7" | "maj7" | "m7major" => SeventhQuality::Major7,
            "minor7" | "min7" | "m7" => SeventhQuality::Minor7,
            _ => return None,
        })
    }
}

/// 构造三和弦（根音在给定八度，字母堆叠三度，拼写自动正确）。
pub fn triad(root: Spelled, quality: TriadQuality, octave: i8) -> Vec<Note> {
    let [t, f] = quality.intervals();
    stacked_note(root, octave, 0, &[(2, t), (4, f)])
}

/// 构造七和弦。
pub fn seventh_chord(root: Spelled, quality: SeventhQuality, octave: i8) -> Vec<Note> {
    let [t, f, s] = quality.intervals();
    stacked_note(root, octave, 0, &[(2, t), (4, f), (6, s)])
}

/// 按字母步进 + 目标半音堆叠音符（内部工具）。
fn stacked_note(root: Spelled, octave: i8, root_step: i8, upper: &[(i8, i8)]) -> Vec<Note> {
    let mut notes = vec![scale_position(root, octave, root_step, 0)];
    for &(step, semi) in upper {
        notes.push(scale_position(root, octave, step, semi));
    }
    notes
}

fn scale_position(tonic: Spelled, octave: i8, step: i8, semitones_from_tonic: i8) -> Note {
    let letter = Letter::from_index(tonic.step_index() + step);
    let octave_shift = (tonic.step_index() + step) / 7;
    let target = (tonic.semitone() + semitones_from_tonic).rem_euclid(12);
    let mut accidental = target - letter.semitone();
    if accidental > 6 {
        accidental -= 12;
    } else if accidental < -6 {
        accidental += 12;
    }
    Note::new(Spelled { letter, accidental }, octave + octave_shift)
}

/// 转位：0=原位，1=第一转位（三音在底），2=第二转位（五音在底）。第五章转位教学使用。
#[allow(dead_code)]
pub fn invert(notes: &[Note], inversion: u8) -> Vec<Note> {
    if notes.is_empty() {
        return notes.to_vec();
    }
    let mut result = notes.to_vec();
    for _ in 0..inversion {
        let mut lowest = result.remove(0);
        lowest.octave += 1;
        result.push(lowest);
    }
    result
}

/// 调内三和弦信息（级数与罗马数字）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiatonicTriad {
    /// 级数 1–7（也是简谱数字）。
    pub degree: u8,
    /// 罗马数字（大写=大三和弦，小写=小三，°=减，+=增）。
    pub roman: String,
    /// 简谱级数记号，如 "1"、"5m" 风格由前端渲染，这里给纯数字。
    pub jianpu_degree: u8,
    pub root: Note,
    pub quality: TriadQuality,
    /// 和弦音（原位）。
    pub notes: Vec<Note>,
}

const ROMAN: [&str; 7] = ["I", "II", "III", "IV", "V", "VI", "VII"];

/// 推导大调或自然小调的七个调内三和弦。
pub fn diatonic_triads(tonic: Spelled, kind: ScaleKind, octave: i8) -> Vec<DiatonicTriad> {
    debug_assert!(kind.is_heptatonic(), "调内三和弦只支持七声音阶");
    let scale = scale_notes(tonic, kind, octave);
    // scale 含结尾主音共 8 个音；取前 7 个为各级
    let mut result = Vec::with_capacity(7);
    for i in 0..7 {
        let root = scale[i];
        let third = scale[(i + 2) % 7];
        let fifth = scale[(i + 4) % 7];
        // 相对根音的实际半音距离（音阶回绕时补一个八度）
        let rel = |n: Note| -> i8 {
            if n.midi() >= root.midi() {
                n.midi() - root.midi()
            } else {
                n.midi() + 12 - root.midi()
            }
        };
        let quality =
            TriadQuality::from_stacked_thirds(rel(third), rel(fifth)).unwrap_or(TriadQuality::Major);

        let roman = match quality {
            TriadQuality::Major => ROMAN[i].to_string(),
            TriadQuality::Minor => ROMAN[i].to_lowercase(),
            TriadQuality::Diminished => format!("{}°", ROMAN[i].to_lowercase()),
            TriadQuality::Augmented => format!("{}+", ROMAN[i]),
        };
        // 和弦音按音高排列（root 起向上）
        let lift = |n: Note| -> Note {
            if n.midi() >= root.midi() { n } else { Note::new(n.spelled, n.octave + 1) }
        };
        let notes = vec![root, lift(third), lift(fifth)];

        result.push(DiatonicTriad {
            degree: (i + 1) as u8,
            roman,
            jianpu_degree: (i + 1) as u8,
            root,
            quality,
            notes,
        });
    }
    result
}

/// 经典和弦进行预设（级数序列，可在任意调上实现）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progression {
    pub id: &'static str,
    pub name_zh: &'static str,
    pub description: &'static str,
    /// 级数序列（1–7，大写小写语义由调内三和弦决定）。
    pub degrees: Vec<u8>,
}

pub fn progression_presets() -> Vec<Progression> {
    vec![
        Progression {
            id: "pop-1564",
            name_zh: "流行万能进行",
            description: "1–5–6–4，无数流行歌的骨架，学会它等于学会几百首歌的和声。",
            degrees: vec![1, 5, 6, 4],
        },
        Progression {
            id: "doo-wop-1645",
            name_zh: "50 年代进行",
            description: "1–6–4–5，老情歌与 Doo-wop 的经典套路。",
            degrees: vec![1, 6, 4, 5],
        },
        Progression {
            id: "canon",
            name_zh: "卡农进行",
            description: "1–5–6–3–4–1–4–5，帕赫贝尔卡农的进行，听起来自然流动。",
            degrees: vec![1, 5, 6, 3, 4, 1, 4, 5],
        },
        Progression {
            id: "two-five-one",
            name_zh: "爵士 2-5-1",
            description: "2–5–1，爵士乐最核心的终止式。",
            degrees: vec![2, 5, 1],
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(n: &str) -> Spelled {
        Spelled::parse(n).unwrap()
    }

    fn names(notes: &[Note]) -> Vec<String> {
        notes.iter().map(|n| n.spelled.name()).collect()
    }

    #[test]
    fn triads() {
        assert_eq!(names(&triad(s("C"), TriadQuality::Major, 4)), ["C", "E", "G"]);
        assert_eq!(names(&triad(s("C"), TriadQuality::Minor, 4)), ["C", "Eb", "G"]);
        assert_eq!(names(&triad(s("C"), TriadQuality::Augmented, 4)), ["C", "E", "G#"]);
        assert_eq!(names(&triad(s("C"), TriadQuality::Diminished, 4)), ["C", "Eb", "Gb"]);
        // B 减三和弦：B D F
        assert_eq!(names(&triad(s("B"), TriadQuality::Diminished, 4)), ["B", "D", "F"]);
    }

    #[test]
    fn sevenths() {
        assert_eq!(
            names(&seventh_chord(s("G"), SeventhQuality::Dominant, 4)),
            ["G", "B", "D", "F"]
        );
        assert_eq!(
            names(&seventh_chord(s("C"), SeventhQuality::Major7, 4)),
            ["C", "E", "G", "B"]
        );
        assert_eq!(
            names(&seventh_chord(s("A"), SeventhQuality::Minor7, 4)),
            ["A", "C", "E", "G"]
        );
    }

    #[test]
    fn inversions() {
        let c = triad(s("C"), TriadQuality::Major, 4);
        let first = invert(&c, 1);
        assert_eq!(names(&first), ["E", "G", "C"]);
        assert_eq!(first[0].name(), "E4");
        assert_eq!(first[2].name(), "C5");
        let second = invert(&c, 2);
        assert_eq!(names(&second), ["G", "C", "E"]);
        assert_eq!(second[2].name(), "E5");
    }

    #[test]
    fn c_major_diatonic() {
        let triads = diatonic_triads(s("C"), ScaleKind::Major, 4);
        let romans: Vec<&str> = triads.iter().map(|t| t.roman.as_str()).collect();
        assert_eq!(romans, ["I", "ii", "iii", "IV", "V", "vi", "vii°"]);
        assert_eq!(triads[0].notes[0].name(), "C4");
        assert_eq!(triads[6].root.name(), "B4");
        assert_eq!(names(&triads[1].notes), ["D", "F", "A"]); // ii = Dm
        assert_eq!(names(&triads[6].notes), ["B", "D", "F"]); // vii° = Bdim
    }

    #[test]
    fn a_minor_diatonic() {
        let triads = diatonic_triads(s("A"), ScaleKind::NaturalMinor, 4);
        let romans: Vec<&str> = triads.iter().map(|t| t.roman.as_str()).collect();
        assert_eq!(romans, ["i", "ii°", "III", "iv", "v", "VI", "VII"]);
        assert_eq!(names(&triads[1].notes), ["B", "D", "F"]); // ii°
    }

    #[test]
    fn g_major_diatonic_spelling() {
        let triads = diatonic_triads(s("G"), ScaleKind::Major, 4);
        // V 级 = D 大三和弦；vii° = F# 减三和弦
        assert_eq!(names(&triads[4].notes), ["D", "F#", "A"]);
        assert_eq!(names(&triads[6].notes), ["F#", "A", "C"]);
    }

    #[test]
    fn progression_presets_sane() {
        let presets = progression_presets();
        assert!(presets.len() >= 4);
        for p in &presets {
            assert!(p.degrees.iter().all(|d| (1..=7).contains(d)));
            assert!(p.degrees.len() >= 3);
        }
    }
}
