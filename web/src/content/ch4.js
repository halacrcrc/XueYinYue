// 第四章 音程：度数与半音、协和与不协和（波形可视化）、半音数对照、练习

export const ch4 = {
  id: 'ch4',
  badge: '第四章',
  title: '音程',
  colorVar: '--fa',
  lessons: [
    {
      id: 'ch4-l1',
      title: '音程是两音的距离',
      blocks: [
        { t: 'p', text: '两个音之间隔了多远，就叫**音程**。描述它需要两个数：**度数**（隔了几个字母）和**半音数**（实际隔了几个半音）。' },
        { t: 'p', text: '度数的数法**包含头尾**：C→D 数 C、D 两个字母，是**二度**；C→E 是三度；C→G 是五度；C 到高音 C 是八度。' },
        {
          t: 'staff',
          notes: [
            { key: 'c/4' },
            { key: 'e/4', degree: 3 },
            { key: 'g/4', degree: 5 },
          ],
          caption: 'C 到 E：三度；C 到 G：五度。',
        },
        { t: 'p', text: '但光有度数不够——**半音数才决定音程的"性格"**。同样是三度，隔着 4 个半音叫**大三度**，隔 3 个半音叫**小三度**，听感一个明亮一个柔和。' },
        {
          t: 'demo',
          highlight: [60, 64],
          play: [60, 64],
          playMode: 'melody',
          button: '大三度（4 半音）',
          caption: 'C→E：大三度，明亮。',
        },
        {
          t: 'demo',
          highlight: [60, 63],
          play: [60, 63],
          playMode: 'melody',
          button: '小三度（3 半音）',
          caption: 'C→E♭：小三度，柔和。',
        },
      ],
    },
    {
      id: 'ch4-l2',
      title: '协和与不协和',
      blocks: [
        { t: 'p', text: '有的音程两个音**融在一起**（协和），有的**互相较劲**（不协和）。大致三档：' },
        { t: 'callout', text: '**完全协和**：纯一度、纯八度、纯五度、纯四度 —— 像一个人在回声里唱歌\n**不完全协和**：大三、小三、大六、小六度 —— 两个不同的人和谐地合唱\n**不协和**：大二、小二、大七、小七度、三全音 —— 摩擦、紧张、想解决' },
        { t: 'p', text: '为什么？回到振动本身：协和 = 两个波的周期**能对上号**。' },
        {
          t: 'waves',
          voices: [
            { ratio: 1, amp: 0.85, colorVar: '--do' },
            { ratio: 1.5, amp: 0.85, colorVar: '--sol' },
          ],
          caption: '纯五度 ≈ 3:2 —— 红波每 2 个周期、蓝波每 3 个周期就重合一次（3:2 的近似），叠加波永远整齐循环。',
        },
        {
          t: 'waves',
          voices: [
            { ratio: 1, amp: 0.85, colorVar: '--do' },
            { ratio: 1.41421, amp: 0.85, colorVar: '--fa' },
          ],
          caption: '三全音 ≈ √2:1 —— 两个波永远对不齐，叠加波形每一轮都在变形：这就是"紧张感"的物理来源。',
        },
        {
          t: 'demo',
          highlight: [60, 67],
          play: [60, 67],
          playMode: 'chord',
          button: '纯五度（协和）',
          caption: 'C + G 同时响：稳定、空洞而辽阔。',
        },
        {
          t: 'demo',
          highlight: [60, 66],
          play: [60, 66],
          playMode: 'chord',
          button: '三全音（不协和）',
          caption: 'C + F♯ 同时响：不安分，好像非要往哪走不可。中世纪它被称为"音乐里的魔鬼"。',
        },
      ],
    },
    {
      id: 'ch4-l3',
      title: '半音数对照表',
      blocks: [
        { t: 'p', text: '入门阶段，把这张表装进手感里（弹 C + 上方音，边弹边念名字）：' },
        { t: 'callout', text: '1 半音 = 小二度　　2 半音 = 大二度\n3 半音 = 小三度　　4 半音 = 大三度\n5 半音 = 纯四度　　6 半音 = 三全音\n7 半音 = 纯五度　　8 半音 = 小六度\n9 半音 = 大六度　　10 半音 = 小七度\n11 半音 = 大七度　 12 半音 = 纯八度' },
        { t: 'p', text: '耳朵记不住的时候，可以借**熟悉的歌开头**当锚点：纯五度像《一闪一闪亮晶晶》第一个跳跃（do→sol）；纯四度像婚礼进行曲（do→fa）；大六度像《我爱你中国》开头的辽阔感。' },
        {
          t: 'demo',
          highlight: [60, 67],
          play: [60, 67],
          playMode: 'melody',
          button: 'do→sol（纯五度）',
          caption: '小星星的第一个跳跃。',
        },
      ],
    },
    {
      id: 'ch4-quiz',
      title: '小练习',
      blocks: [
        { t: 'quiz', kinds: ['interval-see', 'interval-ear'], count: 6, intro: '先看谱认音程，再闭上眼听——一半看、一半听。' },
      ],
    },
  ],
}
