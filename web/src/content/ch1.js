// 第一章 声音与音名：振动、钢琴地图、音名、唱名与简谱

export const ch1 = {
  id: 'ch1',
  badge: '第一章',
  title: '声音与音名',
  colorVar: '--do',
  lessons: [
    {
      id: 'ch1-l1',
      title: '声音是振动',
      blocks: [
        { t: 'p', text: '你听到的每一个声音，本质上都是某个东西在**振动**——吉他弦来回摆动、鼓面起伏、你的声带抖动。振动推开空气，一浪一浪传到耳朵里，就是声音。' },
        { t: 'p', text: '振动有两个最要紧的参数：**快慢**和**幅度**。振动越快，音越高；幅度越大，音越大。' },
        {
          t: 'waves',
          voices: [
            { ratio: 1, amp: 0.9, colorVar: '--do' },
            { ratio: 2, amp: 0.7, colorVar: '--sol' },
          ],
          caption: '蓝波（sol）的振动速度刚好是红波（do）的两倍——它们是"同一个音"的两个八度。',
        },
        {
          t: 'demo',
          play: [60, 72],
          playMode: 'melody',
          highlight: [60, 72],
          button: '听 C4 与 C5',
          caption: 'C5 的振动速度是 C4 的两倍（约 262Hz 与 524Hz），所以听起来"一样，但更高"——这就是**八度**。',
        },
      ],
    },
    {
      id: 'ch1-l2',
      title: '钢琴的地图',
      blocks: [
        { t: 'p', text: '打开钢琴：一排**白键**加一排**黑键**。黑键不是乱排的——它们是 **2 个一组、3 个一组**，循环往复。' },
        { t: 'p', text: '这个分组就是键盘的"路标"：**两个黑键紧挨着的左边那个白键，就是 C**。找到所有的 C，你就不会在键盘上迷路。' },
        {
          t: 'demo',
          startMidi: 60,
          octaves: 2,
          highlight: [60, 72],
          play: [60, 72],
          playMode: 'melody',
          button: '听所有的 C',
          caption: '高亮的两个键都是 C，中间隔着 12 个半音（一个八度）。',
        },
        {
          t: 'demo',
          startMidi: 60,
          octaves: 2,
          highlight: [61, 63, 66, 68, 70, 73, 75, 78, 80, 82],
          play: [61, 63, 66, 68, 70],
          playMode: 'arp',
          button: '听黑键组',
          caption: '黑键组：2 + 3，2 + 3 ……这个模式永远不会变。',
        },
      ],
    },
    {
      id: 'ch1-l3',
      title: '七个音名',
      blocks: [
        { t: 'p', text: '白键有七个名字，从低到高是 **C D E F G A B**，然后又从 C 重新开始。这套名字叫**音名**，全世界通用。' },
        { t: 'p', text: '黑键的名字借用相邻的白键：C 右边的黑键比 C 高半音，叫 **C♯（升 C）**；它也可以叫 **D♭（降 D）**——同一个键，两个名字，取决于你从哪边数过来。' },
        {
          t: 'demo',
          startMidi: 60,
          octaves: 2,
          label: 'name',
          play: [60, 62, 64, 65, 67, 69, 71, 72],
          playMode: 'melody',
          button: '从 C 弹到高音 C',
          caption: '白键的七个音名，循环不止。',
        },
        { t: 'callout', text: '有个音值得记住：**A4 = 440 赫兹**（标准音）。乐队调音都从它出发。' },
      ],
    },
    {
      id: 'ch1-l4',
      title: '唱名与简谱',
      blocks: [
        { t: 'p', text: '唱歌的时候我们不给音起名，我们**唱**它们：do、re、mi、fa、sol、la、si。简谱里干脆记成数字 **1 2 3 4 5 6 7**。' },
        { t: 'p', text: '在 C 大调里（本教程的大本营），**1 就是 C**，2 是 D……7 是 B。把琴键标签切到"简谱"看看。' },
        {
          t: 'jianpu',
          scale: { tonic: 'C', kind: 'major', octave: 4 },
          caption: 'C 大调音阶的简谱：1 2 3 4 5 6 7 i（最高那个 1 头顶加点，表示高八度）。',
        },
        {
          t: 'demo',
          startMidi: 60,
          octaves: 2,
          key: { tonic: 'C', mode: 'major' },
          label: 'jianpu',
          play: [60, 62, 64, 65, 67, 69, 71, 72],
          playMode: 'melody',
          button: '唱名模式听音阶',
          caption: '琴键换上了唱名颜色——这套颜色贯穿全站，见到颜色就知道是哪个音级。',
        },
        { t: 'callout', text: '**颜色即乐理**：红 do、橙 re、黄 mi、绿 fa、蓝 sol、紫 la、粉 si。记住它，后面全靠它。' },
      ],
    },
    {
      id: 'ch1-quiz',
      title: '小练习',
      blocks: [
        { t: 'quiz', kinds: ['note-name', 'jianpu-digit', 'note-name'], count: 5, intro: '认音名和简谱数字，5 题热身。' },
        { t: 'drill', kinds: ['note-name', 'jianpu-digit'], intro: '音名与简谱不限量特训——练到条件反射。' },
      ],
    },
  ],
}
