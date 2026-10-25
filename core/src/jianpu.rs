//! 简谱：调内音级 → 数字（1–7）+ 八度点 + 变音记号。
//!
//! 约定：无点的 1 = 参考八度上的主音；高八度加上点、低八度加下点。
//! 前端负责渲染点的位置，本模块只给出结构化数据。

use crate::note::{Note, Spelled};
use crate::scale::ScaleKind;
use serde::Serialize;

/// 唱名（首调，随调移动）。
pub const SOLFEGE_ZH: [&str; 7] = ["do", "re", "mi", "fa", "sol", "la", "si"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Jianpu {
    /// 数字 1–7。
    pub digit: u8,
    /// 八度偏移：0 无点，+1 上加点，-1 下加点。
    pub octave_offset: i8,
    /// 变音：0 调内自然音，+1 升，-1 降（±2 重升/重降）。
    pub accidental: i8,
}

impl Jianpu {
    /// 首调唱名（do–si）。
    pub fn solfege(&self) -> &'static str {
        SOLFEGE_ZH[(self.digit - 1) as usize]
    }
}

/// 求某音符在给定调（音阶）下的简谱表示。
///
/// `reference_octave`：无点 1 所在的主音八度（通常取乐器左侧起始八度）。
pub fn note_to_jianpu(
    key: Spelled,
    kind: ScaleKind,
    reference_octave: i8,
    note: Note,
) -> Jianpu {
    // 自然音级序号差 → 数字与八度点
    let du = (note.octave * 7 + note.spelled.step_index())
        - (reference_octave * 7 + key.step_index());
    let octave_offset = du.div_euclid(7);
    let digit = (du.rem_euclid(7) + 1) as u8;

    // 变音记号：该字母在调内的"应有"半音 vs 实际半音
    let accidental = letter_accidental_in_key(key, kind, note.spelled.step_index());
    let actual = note.spelled.accidental;
    Jianpu {
        digit,
        octave_offset,
        accidental: actual - accidental,
    }
}

/// 调内某字母的自然 accidental（由音阶模式推得）。
fn letter_accidental_in_key(key: Spelled, kind: ScaleKind, letter_index: i8) -> i8 {
    let pattern = kind.pattern();
    // 音阶第 i 级：字母 = key.letter + i，半音 = key.semitone + pattern[i]
    let steps_from_tonic = (letter_index - key.step_index()).rem_euclid(7);
    let Some(&semi) = pattern.get(steps_from_tonic as usize) else {
        return 0; // 非七声音阶（如五声）按自然音处理
    };
    let letter_semitone = {
        use crate::note::Letter;
        Letter::from_index(letter_index).semitone()
    };
    let target = (key.semitone() + semi).rem_euclid(12);
    let mut diff = target - letter_semitone;
    if diff > 6 {
        diff -= 12;
    } else if diff < -6 {
        diff += 12;
    }
    diff
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(n: &str) -> Spelled {
        Spelled::parse(n).unwrap()
    }
    fn n(name: &str) -> Note {
        Note::parse(name).unwrap()
    }

    #[test]
    fn c_major_basic() {
        let key = s("C");
        // C4 → 1 无点
        assert_eq!(
            note_to_jianpu(key, ScaleKind::Major, 4, n("C4")),
            Jianpu { digit: 1, octave_offset: 0, accidental: 0 }
        );
        // D4 → 2
        assert_eq!(note_to_jianpu(key, ScaleKind::Major, 4, n("D4")).digit, 2);
        // B4 → 7；B3 → 7 低八度（下加点）
        assert_eq!(note_to_jianpu(key, ScaleKind::Major, 4, n("B4")).digit, 7);
        let b3 = note_to_jianpu(key, ScaleKind::Major, 4, n("B3"));
        assert_eq!((b3.digit, b3.octave_offset), (7, -1));
        // C5 → 1 高八度（上加点）
        let c5 = note_to_jianpu(key, ScaleKind::Major, 4, n("C5"));
        assert_eq!((c5.digit, c5.octave_offset), (1, 1));
    }

    #[test]
    fn accidentals_outside_key() {
        // C 大调里的 F#4 → 4 升（#fa）
        let j = note_to_jianpu(s("C"), ScaleKind::Major, 4, n("F#4"));
        assert_eq!((j.digit, j.accidental), (4, 1));
        // C 大调里的 Bb4 → 7 降（bSi）
        let j = note_to_jianpu(s("C"), ScaleKind::Major, 4, n("Bb4"));
        assert_eq!((j.digit, j.accidental), (7, -1));
    }

    #[test]
    fn g_major_f_sharp_is_diatonic() {
        // G 大调的 F# 是调内音：无变音记号
        let j = note_to_jianpu(s("G"), ScaleKind::Major, 4, n("F#4"));
        assert_eq!((j.digit, j.accidental), (7, 0));
        // 而 F 还原音在 G 大调是 降7
        let j = note_to_jianpu(s("G"), ScaleKind::Major, 4, n("F4"));
        assert_eq!((j.digit, j.accidental), (7, -1));
    }

    #[test]
    fn a_minor() {
        // a 小调参考音 A4：G5 是无点的 7（自然小调 7 级无升）
        let j = note_to_jianpu(s("A"), ScaleKind::NaturalMinor, 4, n("G5"));
        assert_eq!((j.digit, j.accidental, j.octave_offset), (7, 0, 0));
        // G#5 是升 7（和声小调语境）
        let j = note_to_jianpu(s("A"), ScaleKind::NaturalMinor, 4, n("G#5"));
        assert_eq!(j.accidental, 1);
        // G4 在参考八度之下：低八度的 7（下加点）
        let j = note_to_jianpu(s("A"), ScaleKind::NaturalMinor, 4, n("G4"));
        assert_eq!((j.digit, j.octave_offset), (7, -1));
    }

    #[test]
    fn solfege_names() {
        let j = note_to_jianpu(s("C"), ScaleKind::Major, 4, n("G4"));
        assert_eq!(j.solfege(), "sol");
    }
}
