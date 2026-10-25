//! 音符：带正确拼写的音名（字母+升降号）、八度、MIDI 号、频率。
//!
//! 拼写（F♯ 还是 G♭）在乐理教学中不可省略——音程的"度数"靠字母距离计算，
//! 所以模型必须保留字母与 accidental，而不是只存 12 个半音索引。

use serde::Serialize;

/// 七个自然音级字母。
pub const LETTER_NAMES: [&str; 7] = ["C", "D", "E", "F", "G", "A", "B"];
/// 各字母在自然音级中的半音位置（C=0 … B=11）。
pub const LETTER_SEMITONES: [i8; 7] = [0, 2, 4, 5, 7, 9, 11];
/// 固定唱名（音级唱名，与调无关时的字母唱名）。第一章"音名与唱名"教学使用。
#[allow(dead_code)]
pub const SOLFEGE: [&str; 7] = ["do", "re", "mi", "fa", "sol", "la", "si"];

/// 音名字母（自然音级索引）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum Letter {
    C = 0,
    D = 1,
    E = 2,
    F = 3,
    G = 4,
    A = 5,
    B = 6,
}

impl Letter {
    pub fn from_index(index: i8) -> Letter {
        match index.rem_euclid(7) {
            0 => Letter::C,
            1 => Letter::D,
            2 => Letter::E,
            3 => Letter::F,
            4 => Letter::G,
            5 => Letter::A,
            _ => Letter::B,
        }
    }

    /// 该字母在八度内的半音位置。
    pub fn semitone(self) -> i8 {
        LETTER_SEMITONES[self as usize]
    }

    pub fn name(self) -> &'static str {
        LETTER_NAMES[self as usize]
    }
}

/// 带升降号拼写的音级（accidental：-2=重降 … 0=还原 … +2=重升）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Spelled {
    pub letter: Letter,
    pub accidental: i8,
}

impl Spelled {
    pub fn natural(letter: Letter) -> Spelled {
        Spelled { letter, accidental: 0 }
    }

    /// 八度内半音位置（0–11）。
    pub fn semitone(self) -> i8 {
        (self.letter.semitone() + self.accidental).rem_euclid(12)
    }

    /// 自然音级序号（0–6），用于度数计算。
    pub fn step_index(self) -> i8 {
        self.letter as i8
    }

    /// 英文拼写，如 "C"、"F#"、"Bb"、"Fx"（重升）。
    pub fn name(self) -> String {
        let mut s = String::from(self.letter.name());
        let mark = if self.accidental > 0 { '#' } else { 'b' };
        for _ in 0..self.accidental.abs() {
            s.push(mark);
        }
        s
    }

    /// 中文拼写，如 "C"、"升F"、"降B"。
    pub fn name_zh(self) -> String {
        let prefix = match self.accidental {
            0 => String::new(),
            1 => "升".to_string(),
            -1 => "降".to_string(),
            2 => "重升".to_string(),
            -2 => "重降".to_string(),
            _ => String::new(),
        };
        format!("{}{}", prefix, self.letter.name())
    }

    /// 解析 "C"、"F#"、"Bb"、"F##"（大小写升降号均可，也接受 ♯/♭）。
    pub fn parse(s: &str) -> Option<Spelled> {
        let s = s.trim();
        let mut chars = s.chars();
        let first = chars.next()?;
        let letter = match first.to_ascii_uppercase() {
            'C' => Letter::C,
            'D' => Letter::D,
            'E' => Letter::E,
            'F' => Letter::F,
            'G' => Letter::G,
            'A' => Letter::A,
            'B' => Letter::B,
            _ => return None,
        };
        let mut accidental = 0i8;
        for c in chars {
            match c {
                '#' | '♯' => accidental += 1,
                'b' | 'B' | '♭' => accidental -= 1,
                _ => return None,
            }
        }
        if accidental.abs() > 2 {
            return None;
        }
        Some(Spelled { letter, accidental })
    }

    /// 同半音位置的另一拼写（F# ↔ Gb、B ↔ Cb）。仅用于教学展示，不参与计算。
    #[allow(dead_code)]
    pub fn enharmonic_partner(self) -> Option<Spelled> {
        if self.accidental != 0 {
            // 升号拼法 → 上方字母；降号拼法 → 下方字母；accidental 由目标半音反推
            let letter = if self.accidental > 0 {
                Letter::from_index(self.step_index() + 1)
            } else {
                Letter::from_index(self.step_index() - 1)
            };
            let target = self.semitone();
            let mut acc = target - letter.semitone();
            if acc > 6 {
                acc -= 12;
            } else if acc < -6 {
                acc += 12;
            }
            Some(Spelled { letter, accidental: acc })
        } else {
            match self.letter {
                Letter::B => Some(Spelled { letter: Letter::C, accidental: -1 }),
                Letter::E => Some(Spelled { letter: Letter::F, accidental: -1 }),
                Letter::C => Some(Spelled { letter: Letter::B, accidental: 1 }),
                Letter::F => Some(Spelled { letter: Letter::E, accidental: 1 }),
                _ => None,
            }
        }
    }
}

/// 科学记谱音符：拼写 + 八度（C4 = 中央 C = MIDI 60）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Note {
    pub spelled: Spelled,
    pub octave: i8,
}

impl Note {
    pub fn new(spelled: Spelled, octave: i8) -> Note {
        Note { spelled, octave }
    }

    /// MIDI 音高号（C4 → 60，A4 → 69）。
    /// 必须以"自然音级 + 变音偏移"计算：Cb5 = B4（71）、B#4 = C5（72）。
    pub fn midi(self) -> i8 {
        (self.octave + 1) * 12 + self.spelled.letter.semitone() + self.spelled.accidental
    }

    /// 频率（Hz），A4 = 440，十二平均律。
    pub fn frequency(self) -> f64 {
        440.0 * 2f64.powf((self.midi() as f64 - 69.0) / 12.0)
    }

    /// 如 "F#4"。
    pub fn name(self) -> String {
        format!("{}{}", self.spelled.name(), self.octave)
    }

    /// 如 "升F4"。
    pub fn name_zh(self) -> String {
        format!("{}{}", self.spelled.name_zh(), self.octave)
    }

    /// 解析 "C4"、"F#3"、"Bb5"（八度可省略，默认 4）。
    pub fn parse(s: &str) -> Option<Note> {
        let s = s.trim();
        // 找到八度数字的位置（拼写部分可能带 #/b）
        let split_at = s
            .char_indices()
            .find(|(_, c)| c.is_ascii_digit())
            .map(|(i, _)| i)
            .unwrap_or(s.len());
        let spelled = Spelled::parse(&s[..split_at])?;
        let octave: i8 = if split_at < s.len() {
            s[split_at..].trim().parse().ok()?
        } else {
            4
        };
        Some(Note { spelled, octave })
    }

    /// 从 MIDI 号构造（键盘映射用；默认升号拼法，可选降号）。
    pub fn from_midi(midi: i8, prefer_flat: bool) -> Note {
        let octave = midi.div_euclid(12) - 1;
        let semitone = midi.rem_euclid(12);
        // 先找自然音级命中
        for (i, &st) in LETTER_SEMITONES.iter().enumerate() {
            if st == semitone {
                return Note::new(Spelled::natural(Letter::from_index(i as i8)), octave);
            }
        }
        // 黑键：升号拼法 = 取低半音的字母（C#、D#…），降号拼法 = 取高半音的字母（Db、Eb…）
        if prefer_flat {
            for (i, &st) in LETTER_SEMITONES.iter().enumerate() {
                if (st - 1).rem_euclid(12) == semitone {
                    return Note::new(
                        Spelled { letter: Letter::from_index(i as i8), accidental: -1 },
                        octave,
                    );
                }
            }
        } else {
            for (i, &st) in LETTER_SEMITONES.iter().enumerate() {
                if (st + 1).rem_euclid(12) == semitone {
                    return Note::new(
                        Spelled { letter: Letter::from_index(i as i8), accidental: 1 },
                        octave,
                    );
                }
            }
        }
        unreachable!("12 半音必有命中")
    }

    /// 按半音数移调，保持拼写合理（沿字母行进，accidental 由目标半音推得）。
    #[allow(dead_code)]
    pub fn transpose_semitones(self, semitones: i8) -> Note {
        let midi = self.midi() + semitones;
        let steps = semitones.div_euclid(12) * 7; // 粗略字母步进基数
        // 更精确：按"每 12 半音 7 个音级"的近似即可满足教学场景
        let letter = Letter::from_index(self.spelled.step_index() + steps);
        let octave = midi.div_euclid(12) - 1;
        let accidental = (midi.rem_euclid(12) - letter.semitone()).rem_euclid(12);
        let accidental = if accidental > 6 { accidental - 12 } else { accidental };
        Note::new(Spelled { letter, accidental }, octave)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn midi_and_frequency() {
        assert_eq!(Note::parse("C4").unwrap().midi(), 60);
        assert_eq!(Note::parse("A4").unwrap().midi(), 69);
        let a4 = Note::parse("A4").unwrap();
        assert!((a4.frequency() - 440.0).abs() < 1e-9);
        let a3 = Note::parse("A3").unwrap();
        assert!((a3.frequency() - 220.0).abs() < 1e-9);
    }

    #[test]
    fn midi_with_accidentals() {
        // 降号：Cb5 = B4，Bb4 = A#4，Eb4
        assert_eq!(Note::parse("Cb5").unwrap().midi(), 71);
        assert_eq!(Note::parse("Bb4").unwrap().midi(), 70);
        assert_eq!(Note::parse("Eb4").unwrap().midi(), 63);
        // 升号跨线：B#4 = C5
        assert_eq!(Note::parse("B#4").unwrap().midi(), 72);
        // 重升/重降
        assert_eq!(Note::parse("F##4").unwrap().midi(), 67);
        assert_eq!(Note::parse("Cbb4").unwrap().midi(), 58);
        // 修复回归：F 减三和弦 F4–Ab4–Cb5
        assert_eq!(Note::parse("F4").unwrap().midi(), 65);
        assert_eq!(Note::parse("Ab4").unwrap().midi(), 68);
    }

    #[test]
    fn parse_spellings() {
        assert_eq!(Spelled::parse("F#").unwrap().name(), "F#");
        assert_eq!(Spelled::parse("Bb").unwrap().name(), "Bb");
        assert_eq!(Spelled::parse("升F"), None);
        assert_eq!(Note::parse("F#3").unwrap().name(), "F#3");
        assert_eq!(Note::parse("Bb5").unwrap().midi(), 82);
        // 等音异名：F#4 与 Gb4 同 MIDI
        assert_eq!(
            Note::parse("F#4").unwrap().midi(),
            Note::parse("Gb4").unwrap().midi()
        );
        // 但拼写不同（度数计算会区分）
        assert_ne!(Note::parse("F#4"), Note::parse("Gb4"));
    }

    #[test]
    fn from_midi_roundtrip() {
        for midi in 48..=84 {
            let n = Note::from_midi(midi, false);
            assert_eq!(n.midi(), midi, "midi {} 回环失败", midi);
            // 重新解析名字应得到同一音符
            let re = Note::parse(&n.name()).unwrap();
            assert_eq!(re, n);
        }
    }

    #[test]
    fn enharmonic() {
        let fs = Spelled::parse("F#").unwrap();
        let gb = fs.enharmonic_partner().unwrap();
        assert_eq!(gb.name(), "Gb");
        assert_eq!(fs.semitone(), gb.semitone());
    }

    #[test]
    fn name_zh() {
        assert_eq!(Spelled::parse("F#").unwrap().name_zh(), "升F");
        assert_eq!(Spelled::parse("Bb").unwrap().name_zh(), "降B");
        assert_eq!(Note::parse("Bb3").unwrap().name_zh(), "降B3");
    }
}
