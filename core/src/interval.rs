//! 音程：度数 + 性质，协和度分类，以及教学用的频率比。

use crate::note::Spelled;
use serde::Serialize;

/// 音程性质。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Quality {
    Diminished,
    Minor,
    Major,
    Perfect,
    Augmented,
}

/// 协和度（教学分类）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Consonance {
    /// 完全协和（同度/八度/纯五/纯四）
    Perfect,
    /// 不完全协和（大小三度、大小六度）
    Imperfect,
    /// 不协和（二度、七度、三全音、增减音程）
    Dissonant,
}

/// 各度数在"纯/大"性质下的半音数（索引 = 度数-1）。
const DIATONIC_SEMITONES: [i8; 8] = [0, 2, 4, 5, 7, 9, 11, 12];
/// 哪些度数用"纯"（1、4、5、8），其余用"大/小"。
fn is_perfect_degree(degree: u8) -> bool {
    matches!(degree, 1 | 4 | 5 | 8)
}

/// 简单音程（八度以内），degree 为 1 基。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Interval {
    pub degree: u8,
    pub quality: Quality,
}

impl Interval {
    pub fn new(degree: u8, quality: Quality) -> Interval {
        debug_assert!((1..=8).contains(&degree), "简单音程度数须在 1..=8");
        Interval { degree, quality }
    }

    /// 该音程包含的半音数。
    pub fn semitones(&self) -> i8 {
        let base = DIATONIC_SEMITONES[(self.degree - 1) as usize];
        match self.quality {
            Quality::Perfect | Quality::Major => base,
            Quality::Minor => base - 1,
            Quality::Diminished => base - if is_perfect_degree(self.degree) { 1 } else { 2 },
            Quality::Augmented => base + 1,
        }
    }

    pub fn name_zh(&self) -> String {
        let quality = match self.quality {
            Quality::Diminished => "减",
            Quality::Minor => "小",
            Quality::Major => "大",
            Quality::Perfect if is_perfect_degree(self.degree) => "纯",
            Quality::Perfect => "纯", // 不会出现：纯只用于 1/4/5/8
            Quality::Augmented => "增",
        };
        let degree_zh = ["一", "二", "三", "四", "五", "六", "七", "八"][(self.degree - 1) as usize];
        format!("{}{}度", quality, degree_zh)
    }

    pub fn name_en(&self) -> String {
        let q = match self.quality {
            Quality::Diminished => "dim",
            Quality::Minor => "min",
            Quality::Major => "maj",
            Quality::Perfect => "perf",
            Quality::Augmented => "aug",
        };
        format!("{}{}", q, self.degree)
    }

    /// 协和度分类。
    pub fn consonance(&self) -> Consonance {
        use Quality::*;
        match (self.degree, self.quality) {
            (1, Perfect) | (8, Perfect) | (5, Perfect) | (4, Perfect) => Consonance::Perfect,
            (3, Major) | (3, Minor) | (6, Major) | (6, Minor) => Consonance::Imperfect,
            _ => Consonance::Dissonant,
        }
    }

    /// 教学用：纯律近似频率比（用于波形可视化"为什么协和"）。
    pub fn just_ratio(&self) -> Option<(u32, u32)> {
        use Quality::*;
        Some(match (self.degree, self.quality) {
            (1, Perfect) => (1, 1),
            (2, Minor) => (16, 15),
            (2, Major) => (9, 8),
            (3, Minor) => (6, 5),
            (3, Major) => (5, 4),
            (4, Perfect) => (4, 3),
            (4, Augmented) | (5, Diminished) => (45, 32), // 三全音
            (5, Perfect) => (3, 2),
            (6, Minor) => (8, 5),
            (6, Major) => (5, 3),
            (7, Minor) => (9, 5),
            (7, Major) => (15, 8),
            (8, Perfect) => (2, 1),
            _ => return None,
        })
    }

    /// 是否三全音（增四/减五）。
    pub fn is_tritone(&self) -> bool {
        matches!(
            (self.degree, self.quality),
            (4, Quality::Augmented) | (5, Quality::Diminished)
        )
    }
}

/// 求两个音级之间的简单音程（忽略八度；跨八度时按同八度内的相对关系计算）。
pub fn between(a: Spelled, b: Spelled) -> Interval {
    // 度数：字母距离 + 1
    let step_diff = (b.step_index() - a.step_index()).rem_euclid(7);
    let degree = (step_diff + 1) as u8;
    // 半音距离（同八度内取模）
    let semi_diff = (b.semitone() - a.semitone()).rem_euclid(12);
    interval_from(degree, semi_diff).expect("任何度数+半音组合都应有音程")
}

/// 由度数与半音数推断音程性质。
pub fn interval_from(degree: u8, semitones: i8) -> Option<Interval> {
    if !(1..=8).contains(&degree) {
        return None;
    }
    let base = DIATONIC_SEMITONES[(degree - 1) as usize];
    let diff = semitones - base;
    let quality = if is_perfect_degree(degree) {
        match diff {
            0 => Quality::Perfect,
            1 => Quality::Augmented,
            -1 => Quality::Diminished,
            _ => return None,
        }
    } else {
        match diff {
            0 => Quality::Major,
            -1 => Quality::Minor,
            -2 => Quality::Diminished,
            1 => Quality::Augmented,
            _ => return None,
        }
    };
    Some(Interval::new(degree, quality))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::note::Spelled;

    fn s(name: &str) -> Spelled {
        Spelled::parse(name).unwrap()
    }

    #[test]
    fn basic_intervals() {
        assert_eq!(between(s("C"), s("C")), Interval::new(1, Quality::Perfect));
        assert_eq!(between(s("C"), s("D")), Interval::new(2, Quality::Major));
        assert_eq!(between(s("C"), s("E")), Interval::new(3, Quality::Major));
        assert_eq!(between(s("C"), s("F")), Interval::new(4, Quality::Perfect));
        assert_eq!(between(s("C"), s("G")), Interval::new(5, Quality::Perfect));
        assert_eq!(between(s("C"), s("A")), Interval::new(6, Quality::Major));
        assert_eq!(between(s("C"), s("B")), Interval::new(7, Quality::Major));
        // 八度（跨字母回绕）
        assert_eq!(between(s("C"), s("C")), Interval::new(1, Quality::Perfect));
    }

    #[test]
    fn quality_and_semitones() {
        // 大三度 = 4 半音；小三度 = 3
        assert_eq!(Interval::new(3, Quality::Minor).semitones(), 3);
        assert_eq!(Interval::new(3, Quality::Major).semitones(), 4);
        // 纯五度 = 7 半音
        assert_eq!(Interval::new(5, Quality::Perfect).semitones(), 7);
        // 减五度 = 6（三全音）
        let d5 = Interval::new(5, Quality::Diminished);
        assert_eq!(d5.semitones(), 6);
        assert!(d5.is_tritone());
        // 增四度 = 6
        assert_eq!(Interval::new(4, Quality::Augmented).semitones(), 6);
        // 减三度（少见）：大三度基础 -2 = 2 半音
        assert_eq!(Interval::new(3, Quality::Diminished).semitones(), 2);
    }

    #[test]
    fn spelled_intervals() {
        // E–F 是小二度
        assert_eq!(between(s("E"), s("F")), Interval::new(2, Quality::Minor));
        // F#–B 是减四度？F#到B：字母 F→B 距离 3 → 四度；半音 (11-6)%12=5，纯四基础5 → 纯四度
        assert_eq!(between(s("F#"), s("B")), Interval::new(4, Quality::Perfect));
        // C–G# 是增五度：字母距 4 → 五度；半音 8 - 7 = +1 → 增
        assert_eq!(between(s("C"), s("G#")), Interval::new(5, Quality::Augmented));
        // B–F 是减五度（三全音）
        assert_eq!(between(s("B"), s("F")), Interval::new(5, Quality::Diminished));
        // C#–Ab：字母 C→A 距 5 → 六度；半音 (8-1)%12=7，大六基础9 → -2 减六度
        assert_eq!(between(s("C#"), s("Ab")), Interval::new(6, Quality::Diminished));
    }

    #[test]
    fn names() {
        assert_eq!(Interval::new(5, Quality::Perfect).name_zh(), "纯五度");
        assert_eq!(Interval::new(3, Quality::Major).name_zh(), "大三度");
        assert_eq!(Interval::new(3, Quality::Minor).name_zh(), "小三度");
        assert_eq!(Interval::new(4, Quality::Augmented).name_zh(), "增四度");
        assert_eq!(Interval::new(2, Quality::Minor).name_zh(), "小二度");
    }

    #[test]
    fn consonance_classification() {
        use Consonance::*;
        assert_eq!(Interval::new(5, Quality::Perfect).consonance(), Perfect);
        assert_eq!(Interval::new(8, Quality::Perfect).consonance(), Perfect);
        assert_eq!(Interval::new(3, Quality::Major).consonance(), Imperfect);
        assert_eq!(Interval::new(6, Quality::Minor).consonance(), Imperfect);
        assert_eq!(Interval::new(2, Quality::Major).consonance(), Dissonant);
        assert_eq!(Interval::new(7, Quality::Minor).consonance(), Dissonant);
        assert_eq!(Interval::new(5, Quality::Diminished).consonance(), Dissonant);
    }

    #[test]
    fn just_ratios() {
        assert_eq!(Interval::new(5, Quality::Perfect).just_ratio(), Some((3, 2)));
        assert_eq!(Interval::new(3, Quality::Major).just_ratio(), Some((5, 4)));
        assert_eq!(Interval::new(8, Quality::Perfect).just_ratio(), Some((2, 1)));
    }
}
