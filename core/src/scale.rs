//! 音阶：五声（减法教学先行）、大调、自然/和声/旋律小调、布鲁斯。
//!
//! 拼写策略：沿字母行进（每级进一个字母），accidental 由目标半音推得，
//! 这样 G 大调自动得到 F♯ 而不是 G♭。

use crate::note::{Letter, Note, Spelled};
use serde::Serialize;

/// 大调七个音级的中文名称（级数名称，教学用）。
pub const MAJOR_DEGREE_NAMES_ZH: [&str; 7] =
    ["主音", "上主音", "中音", "下属音", "属音", "下中音", "导音"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ScaleKind {
    MajorPentatonic,
    MinorPentatonic,
    Major,
    NaturalMinor,
    HarmonicMinor,
    MelodicMinor,
    Blues,
    Chromatic,
}

impl ScaleKind {
    /// 从主音起的半音模式。
    pub fn pattern(&self) -> &'static [i8] {
        match self {
            ScaleKind::MajorPentatonic => &[0, 2, 4, 7, 9],
            ScaleKind::MinorPentatonic => &[0, 3, 5, 7, 10],
            ScaleKind::Major => &[0, 2, 4, 5, 7, 9, 11],
            ScaleKind::NaturalMinor => &[0, 2, 3, 5, 7, 8, 10],
            ScaleKind::HarmonicMinor => &[0, 2, 3, 5, 7, 8, 11],
            ScaleKind::MelodicMinor => &[0, 2, 3, 5, 7, 9, 11],
            ScaleKind::Blues => &[0, 3, 5, 6, 7, 10],
            ScaleKind::Chromatic => &[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        }
    }

    /// 各级相对主音的字母行进步数（五声/布鲁斯会跳过字母，必须显式给出）。
    pub fn letter_steps(&self) -> &'static [i8] {
        match self {
            ScaleKind::MajorPentatonic => &[0, 1, 2, 4, 5],
            ScaleKind::MinorPentatonic => &[0, 2, 3, 4, 6],
            ScaleKind::Major
            | ScaleKind::NaturalMinor
            | ScaleKind::HarmonicMinor
            | ScaleKind::MelodicMinor => &[0, 1, 2, 3, 4, 5, 6],
            ScaleKind::Blues => &[0, 2, 3, 3, 4, 6],
            ScaleKind::Chromatic => &[0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6],
        }
    }

    pub fn name_zh(&self) -> &'static str {
        match self {
            ScaleKind::MajorPentatonic => "大调五声音阶",
            ScaleKind::MinorPentatonic => "小调五声音阶",
            ScaleKind::Major => "大调音阶",
            ScaleKind::NaturalMinor => "自然小调音阶",
            ScaleKind::HarmonicMinor => "和声小调音阶",
            ScaleKind::MelodicMinor => "旋律小调音阶",
            ScaleKind::Blues => "布鲁斯音阶",
            ScaleKind::Chromatic => "半音阶",
        }
    }

    pub fn parse(s: &str) -> Option<ScaleKind> {
        let s = s.trim().to_ascii_lowercase().replace(['-', '_'], "");
        Some(match s.as_str() {
            "major" | "maj" => ScaleKind::Major,
            "naturalminor" | "minor" | "natminor" => ScaleKind::NaturalMinor,
            "harmonicminor" => ScaleKind::HarmonicMinor,
            "melodicminor" => ScaleKind::MelodicMinor,
            "majorpentatonic" | "majpenta" | "pentatonic" => ScaleKind::MajorPentatonic,
            "minorpentatonic" | "minpenta" => ScaleKind::MinorPentatonic,
            "blues" => ScaleKind::Blues,
            "chromatic" => ScaleKind::Chromatic,
            _ => return None,
        })
    }

    /// 是否七声（有级数名称与简谱数字）。
    pub fn is_heptatonic(&self) -> bool {
        matches!(
            self,
            ScaleKind::Major
                | ScaleKind::NaturalMinor
                | ScaleKind::HarmonicMinor
                | ScaleKind::MelodicMinor
        )
    }
}

/// 取某音阶从给定八度主音开始一个八度的音符（含上方主音，便于教学展示回环）。
pub fn scale_notes(tonic: Spelled, kind: ScaleKind, octave: i8) -> Vec<Note> {
    if kind == ScaleKind::Chromatic {
        // 半音阶上行惯用升号拼法
        let start_midi = (octave + 1) * 12;
        let mut notes: Vec<Note> = (0..12).map(|i| Note::from_midi(start_midi + i, false)).collect();
        notes.push(Note::new(tonic, octave + 1));
        return notes;
    }
    let semis = kind.pattern();
    let letters = kind.letter_steps();
    debug_assert_eq!(semis.len(), letters.len());
    let mut notes = Vec::with_capacity(semis.len() + 1);
    for i in 0..semis.len() {
        notes.push(scale_note_at(tonic, octave, letters[i], semis[i]));
    }
    // 结尾主音（高八度）
    notes.push(scale_note_at(tonic, octave, 7, 12));
    notes
}

/// 按字母行进 + 目标半音，构造拼写正确的音阶音符。
fn scale_note_at(tonic: Spelled, octave: i8, letter_step: i8, semitones_from_tonic: i8) -> Note {
    let letter_idx = tonic.step_index() + letter_step;
    let letter = Letter::from_index(letter_idx);
    let octave_shift = letter_idx / 7; // 跨八度回绕
    // 目标八度内半音位置
    let target = (tonic.semitone() + semitones_from_tonic).rem_euclid(12);
    let mut accidental = target - letter.semitone();
    if accidental > 6 {
        accidental -= 12;
    } else if accidental < -6 {
        accidental += 12;
    }
    Note::new(Spelled { letter, accidental }, octave + octave_shift)
}

/// 相邻音符间的步进描述（"全音"/"半音"），教学用。
pub fn step_labels(_tonic: Spelled, kind: ScaleKind) -> Vec<&'static str> {
    let pattern = kind.pattern();
    let mut full: Vec<i8> = pattern.to_vec();
    full.push(12);
    full.windows(2)
        .map(|w| match w[1] - w[0] {
            1 => "半音",
            2 => "全音",
            3 => "三个半音（跳过一级）",
            _ => "其他",
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(n: &str) -> Spelled {
        Spelled::parse(n).unwrap()
    }

    fn names(tonic: &str, kind: ScaleKind) -> Vec<String> {
        scale_notes(s(tonic), kind, 4).iter().map(|n| n.spelled.name()).collect()
    }

    #[test]
    fn c_major() {
        assert_eq!(names("C", ScaleKind::Major), ["C", "D", "E", "F", "G", "A", "B", "C"]);
    }

    #[test]
    fn g_major_has_f_sharp() {
        // 拼写正确性：G 大调的第七级是 F♯ 而非 G♭
        assert_eq!(names("G", ScaleKind::Major), ["G", "A", "B", "C", "D", "E", "F#", "G"]);
    }

    #[test]
    fn f_major_has_b_flat() {
        assert_eq!(names("F", ScaleKind::Major), ["F", "G", "A", "Bb", "C", "D", "E", "F"]);
    }

    #[test]
    fn d_major_two_sharps() {
        assert_eq!(names("D", ScaleKind::Major), ["D", "E", "F#", "G", "A", "B", "C#", "D"]);
    }

    #[test]
    fn natural_minor() {
        assert_eq!(
            names("A", ScaleKind::NaturalMinor),
            ["A", "B", "C", "D", "E", "F", "G", "A"]
        );
    }

    #[test]
    fn harmonic_minor_raised_seventh() {
        assert_eq!(
            names("A", ScaleKind::HarmonicMinor),
            ["A", "B", "C", "D", "E", "F", "G#", "A"]
        );
    }

    #[test]
    fn major_pentatonic() {
        assert_eq!(names("C", ScaleKind::MajorPentatonic), ["C", "D", "E", "G", "A", "C"]);
        assert_eq!(names("A", ScaleKind::MinorPentatonic), ["A", "C", "D", "E", "G", "A"]);
    }

    #[test]
    fn octaves_and_midi() {
        let notes = scale_notes(s("C"), ScaleKind::Major, 4);
        assert_eq!(notes[0].midi(), 60);
        assert_eq!(notes[7].midi(), 72);
        // 跨八度拼写：B 大调从 B3 开始，第 7 级 A♯ 在 4 八度
        let b = scale_notes(s("B"), ScaleKind::Major, 3);
        assert_eq!(b[6].name(), "A#4");
        assert_eq!(b[7].name(), "B4");
    }

    #[test]
    fn blues_spelling() {
        // C 布鲁斯：C Eb F F# G Bb（♭5 与 5 同字母不同变音，拼写仍正确）
        assert_eq!(
            names("C", ScaleKind::Blues),
            ["C", "Eb", "F", "F#", "G", "Bb", "C"]
        );
    }

    #[test]
    fn steps() {
        let labels = step_labels(s("C"), ScaleKind::Major);
        assert_eq!(labels, ["全音", "全音", "半音", "全音", "全音", "全音", "半音"]);
    }

    #[test]
    fn kind_parse() {
        assert_eq!(ScaleKind::parse("major"), Some(ScaleKind::Major));
        assert_eq!(ScaleKind::parse("Major-Pentatonic"), Some(ScaleKind::MajorPentatonic));
        assert_eq!(ScaleKind::parse("nope"), None);
    }
}
