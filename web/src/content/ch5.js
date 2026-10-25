// 第五章 和弦：三和弦的构成、大与小、增与减、亲手搭、练习

export const ch5 = {
  id: 'ch5',
  badge: '第五章',
  title: '和弦',
  colorVar: '--sol',
  lessons: [
    {
      id: 'ch5-l1',
      title: '三个音的和声',
      blocks: [
        { t: 'p', text: '一个音是旋律的种子，两个音是音程，而**三个及以上的音同时响**，就是**和弦**。音乐里最常用的是**三和弦**：三个音像叠罗汉，从下往上叫**根音、三音、五音**。' },
        {
          t: 'staff',
          notes: [
            { key: 'c/4', degree: 1 },
            { key: 'e/4', degree: 3 },
            { key: 'g/4', degree: 5 },
          ],
          caption: 'C 大三和弦：C（根）+ E（三音）+ G（五音）。',
        },
        {
          t: 'demo',
          startMidi: 55,
          octaves: 2,
          highlight: [60, 64, 67],
          play: [60, 64, 67],
          playMode: 'chord',
          button: '同时弹响 C 和弦',
          caption: '三个键一起按下——这就是和声：比任何单音都厚实、有"家"的感觉。',
        },
        { t: 'callout', text: '省事记法：**C 大调音阶的 1、3、5 级拿出来，就是 C 和弦**。任何调都一样。' },
      ],
    },
    {
      id: 'ch5-l2',
      title: '大与小',
      blocks: [
        { t: 'p', text: '三和弦分性格，关键看**底下那个三度是大还是小**：' },
        { t: 'callout', text: '**大三和弦** = 大三度 + 小三度（下面宽、上面窄）→ 明亮、开朗\n**小三和弦** = 小三度 + 大三度（下面窄、上面宽）→ 柔和、忧郁' },
        {
          t: 'demo',
          startMidi: 55,
          octaves: 2,
          highlight: [60, 64, 67],
          play: [60, 64, 67],
          playMode: 'chord',
          button: 'C 大三和弦',
          caption: 'C–E–G：大三度(4) + 小三度(3)。',
        },
        {
          t: 'demo',
          startMidi: 55,
          octaves: 2,
          highlight: [57, 60, 64],
          play: [57, 60, 64],
          playMode: 'chord',
          button: 'A 小三和弦',
          caption: 'A–C–E：小三度(3) + 大三度(4)。C 大调和 A 小调是同一批白键，但 A 的三和弦是小三和弦。',
        },
        { t: 'p', text: '流行歌里"开心/伤心"的开关，一大半就在这两个和弦的切换上。' },
      ],
    },
    {
      id: 'ch5-l3',
      title: '增与减',
      blocks: [
        { t: 'p', text: '还有两个"性格极端"的三和弦，入门先混个耳熟：' },
        { t: 'callout', text: '**增三和弦** = 大三度 + 大三度（4+4）→ 悬浮、不安定，像踩不到底\n**减三和弦** = 小三度 + 小三度（3+3）→ 紧张、收缩，像要出事' },
        {
          t: 'demo',
          startMidi: 55,
          octaves: 2,
          highlight: [60, 64, 68],
          play: [60, 64, 68],
          playMode: 'chord',
          button: 'C 增三和弦',
          caption: 'C–E–G♯：上下一样宽，飘飘忽忽。',
        },
        {
          t: 'demo',
          startMidi: 55,
          octaves: 2,
          highlight: [60, 63, 66],
          play: [60, 63, 66],
          playMode: 'chord',
          button: 'C 减三和弦',
          caption: 'C–E♭–G♭：上下一样窄，缩成一团。',
        },
      ],
    },
    {
      id: 'ch5-l4',
      title: '在琴上搭和弦',
      blocks: [
        { t: 'p', text: '轮到你了。规则很简单：**根音 + 往上数 4 个半音 + 再往上数 3 个半音**，就是大三和弦。换成 3 + 4，就是小三和弦。' },
        {
          t: 'demo',
          startMidi: 55,
          octaves: 2,
          highlight: [],
          button: '示范：搭一个 F 大三和弦',
          play: [65, 69, 72],
          playMode: 'arp',
          caption: '先听示范（F–A–C），然后自己在这台琴上把任意一个大三和弦搭出来试试。',
        },
      ],
    },
    {
      id: 'ch5-quiz',
      title: '小练习',
      blocks: [
        { t: 'quiz', kinds: ['chord-see', 'chord-ear'], count: 4, intro: '看谱认和弦 + 闭眼听和弦性质。' },
        { t: 'quiz', kinds: ['build-chord'], count: 2, intro: '最后亲手搭两个。' },
      ],
    },
  ],
}
