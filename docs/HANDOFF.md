# 学音乐（XueYinYue）交接文档

> 本文档是活文档：**每完成一个阶段必须更新**。接手的模型/人请从这里开始。
> 最后更新：2026-10-29——**OMT 扩展批完成**（参考 Open Music Theory：六章加深 +14 课、新增第九章对位入门/第十章曲式入门，demo 引擎新增 voices 双声部；十一章全站注册）；此前**四波 workflow 全量交付完成**（四波 32 项任务、四道质量门全过、cargo test 74 绿）：练习闭环+查询器+节拍器 / 六章+16 课 / 第七八章+练耳新题型 / 多点触控+键位浮层+练耳设置+PWA；五声简谱写法根修（jianpu.rs：非七声音阶不定义调号）；**后续内容开发以 [docs/ROADMAP.md](ROADMAP.md) 与 [docs/TODO.md](TODO.md) 为准**

## 项目一句话

中文互动乐理学习 Web 应用（对标 learningmusic.ableton.com），**Rust/WASM 做全部乐理计算与判分，Web Audio 发声（真实采样+合成兜底），原生 JS 无框架前端**。用户是乐理小白（本人不写代码，由 AI 全部实现）。

## 环境与命令

- Windows + Git Bash；Rust 1.98 + `wasm32-unknown-unknown`；wasm-pack 0.15.0（装在 `~/.cargo/bin`）；Node 24 / npm 11
- **网络代理**：npm 已配置 `127.0.0.1:10808`（HTTP 模式）；cargo/curl 需临时 `export HTTPS_PROXY=http://127.0.0.1:10808`
- 启动开发：`cd D:\XueYinYue\web && npm run dev` → http://localhost:5173
- 重编 Rust → WASM：`npm run build:wasm`（在 web/ 下）；改页面代码 Vite 热更新
- Rust 测试：`cd core && cargo test`（当前 **72 个测试全绿，零警告**）
- 生产构建：`npm run build`

## 架构与职责铁律

```
core/   Rust 乐理引擎（编译为 WASM，src/wasm/ 产物已被 gitignore）
  note.rs      音符：拼写(字母+accidental)、八度、MIDI、频率、解析
  interval.rs  音程：度数+性质、半音数、协和度、纯律频率比
  scale.rs     音阶：五声(先行教学)/大调/三种小调/布鲁斯/半音阶；letter_steps 显式字母表
  chord.rs     三和弦/七和弦/转位/调内三和弦(罗马数字)/进行预设
  jianpu.rs    简谱：数字+八度点+变音（参考八度约定：无点1=reference_octave 主音）
  exercise.rs  四向练习出题器（辨认/听辨/构建）+ 判分 gen_question/check_answer
  lib.rs       wasm-bindgen 接口：core_version/note_info/interval_between/scale/
               triad_chord/seventh_chord_notes/diatonic_triads/progressions/
               jianpu_for_note/keyboard_layout/gen_question/gen_question_in_key/check_answer
web/    Vite + 原生 JS
  audio.js       双层声音引擎：合成兜底(钢琴+鼓) + smplr(SplendidGrandPiano/DrumMachine TR-808)
  piano.js       钢琴组件：点击/电脑键盘(可关)/高亮/标签(音名|简谱|无)/flash/demonstrate
  staff.js       VexFlow 五线谱封装（key 格式 "c/4"，小写）
  jianpu.js      简谱渲染（唱名七色）
  waves.js       波形可视化（Canvas，频率比教学，IO暂停+reduced-motion静态）
  sequencer.js   16格×4鼓步进音序器（lookahead调度、播放头动效、BPM）
  tap-trainer.js 跟打练习（预备4拍+8拍，毫秒误差评分）
  lesson.js      微课引擎：块类型 p/callout/waves/staff/jianpu/demo/sequencer/tap/
                 diatonic/progression/keytool/fifths/quiz；章节渲染+课内导航+localStorage完成态
  content/*.js   章节内容（数据驱动）：ch1 声音与音名、ch2 节奏、ch3 音阶、ch4 音程、ch5 和弦、
                 ch6 和声进行、ch7 调与五度圈、ch8 旋律写作
  components/fifths.js  五度圈互动组件（lesson.js fifths 块专用，ch7 用）
  dashboard.js   首页课程旋律图（SVG五线谱+九音符=八章+训练场，SVG group 链接）
  pages/home.js  首页（hero+旋律图+可弹钢琴+标签chips）
  pages/chapters.js 课程目录（章节卡片+进度+练习/工具入口）
  pages/ear.js   练耳训练场（#/ear）
  pages/fun.js   音乐乐园（#/fun）
  pages/daily.js 每日挑战（#/daily）：10 题混合+小结，题目渲染组件被错题本复用
  pages/mistakes.js 错题本（#/mistakes）：按知识点分组+一键重练，答对移出
  pages/query.js 和弦/音阶查询器（#/query）：钢琴/指板/五线谱三视图
  pages/metronome.js 节拍器（#/metronome）：lookahead 调度鼓点
  main.js        hash 路由：#/、#/chapters、#/chapter/N（1-8）、#/fun、#/daily、#/mistakes、#/query、#/metronome、#/ear
  styles/        tokens.css(设计Token) + components.css + main.css（字体@fontsource自托管）
```

**铁律**：判分/出题/掌握度只发生在 Rust（带单测）；JS 只做呈现、发声、存取。JS 侧 `answer` 字段虽可见，但 UI 必须走 `check_answer`。

## 设计规范（晨光练习室 · Claude 暖纸）

- 底色 `--paper #F2F1EE`（用户指定）、面板 `--surface #FAF9F6`、墨 `--ink #26241F`
- 主操作陶土 `--clay #CC785C`；**唱名七色贯穿全站**：do`#D9433B` re`#E8862E` mi`#E9B93C` fa`#5FA85C` sol`#3E8EC4` la`#7A63C2` si`#C25CA8`
- 字体：**Maple Mono NF CN**（全站主字体，圆角等宽+中文+Nerd 图标，MIT；Noto 兜底）。切片产物在 `web/src/fonts/maple-{400,700}/`（**已提交进仓库**，511 个 woff2 分片按 unicode-range 按需加载）；重建用 `web/scripts/build-maple-fonts.mjs`（需先下载 maple-font releases 的 NF-CN TTF，见脚本注释）
- 动效：弹簧 `--ease-spring`、时长 120–300ms、只用 transform/opacity、prefers-reduced-motion 全退化；琴键按压 3px 下压+阴影收紧；答对绿答错红+抖动
- 不用 SaaS 卡片堆砌；面板=表面色+细边+暖影；触控目标≥44px

## 已完成阶段（均经浏览器实测）

- ✅ **阶段0** 脚手架/Token/字体管线/构建脚本
- ✅ **阶段1** 乐理引擎 + 42 单测（关键修复：`midi()` 必须用 `自然音级半音+accidental`，环绕式写法对降号全错——Cb5 曾算成 83）
- ✅ **阶段2** 声音/钢琴/旋律图/波形（视觉走查过；修复：钢琴标签初始需 refreshLabels）
- ✅ **阶段3** 出题引擎 + 微课引擎 + ch1/3/4/5 全部内容（含四向练习、构建题）
- ✅ **阶段4** 鼓组(TR-808+合成兜底) + 音序器 + 跟打练习 + ch2 全部内容
- ✅ **阶段5** 第六章全上线：diatonic（七和弦点听）、progression（I–V–vi–IV 等四种进行，钢琴逐小节联动）、keytool（8 调移调实验室）
- ✅ **阶段6** progress.rs（掌握度/间隔重复/日历/每日目标，**47 测试全绿**）；练耳训练场 `#/ear`（调性级数[gen_tonal_ear 含 cadence 字段]/音程/和弦三模式，唱名色选项，反应计时）；首页仪表盘（连续天数/今日题数/今日复习 chips/12周热力图/导出导入）；微课作答与完成态全部接入进度系统
- ✅ **阶段7** 移动端 390px 走查（无横向溢出）、生产构建通过
- ✅ **三批**：**课程目录页 `#/chapters`**（8卡片+进度条，导航"课程"入口，章节侧栏"☰ 全部章节"）；**旋律图改 VexFlow 真实雕版音符**（七章节=do-si七音，未开始=空心二分/完成=实心四分，dashboard.js 现依赖 VexFlow）；贴边修复（ear/fun/chapters 页补 gutter+居中）；**全站换 Maple Mono NF CN 字体**；琴键**键位提示**（极淡+悬停显清晰，兼容中文输入法 Process 键）；演示钢琴**标签切换 chips**；正文强调改陶土色（Maple 粗体糊）；简谱八度点位置颠倒修复；**吉他音色**（GM 钢弦吉他+合成拨弦兜底）
- ✅ **滚动兼容专项**：移除 `scroll-behavior:smooth`（部分 webview 实现失效会卡死全部滚动）；首页"先随便弹弹"改按钮+瞬时滚动；路由忽略页内锚点；练习反馈滚动同改

- ✅ **2026-10-28 练习/工具四件套**：**每日挑战 `#/daily`**（10 题跨知识点混合、题型池按已学章节、最好成绩+小结）、**错题本 `#/mistakes`**（按知识点分组、一键重练、答对移出；Rust 去重/累计/封顶 200）、**查询器 `#/query`**（和弦/音阶三视图）、**节拍器 `#/metronome`**；课程目录新增 4 张入口卡片；lesson.js 课程 quiz 答错自动收录错题（renderMc/renderBuild 各一处接线）

- ✅ **2026-10-29 第七/八章 + 练耳三题型**：**第七章「调与五度圈」**（components/fifths.js SVG 十二调环：外环大调/内环关系小调/色环音位/中心调号盘 + I–IV–V–I 播放，音符与调内和弦全由 wasm scale/diatonic_triads 计算；lesson.js 新增 fifths 块；四课）与**第八章「旋律写作」**（动机与模进/乐句问答/给 1–5–6–4 写旋律/实操作业/小练习，五课全用既有块类型）接入全站导航（main.js CHAPTER_CONTENT、dashboard.js CHAPTERS/旋律图、home.js LESSON_TOTALS、chapters.js 目录）；旋律图扩为九音符 c4–d5（第七/八章用 --clay-deep/--clay 陶土族双色，W 1080→1280，容器内横向滑动兼容移动端）；**练耳新题型 key-mode / progression-ear / melody-ear**（exercise.rs + 9 单测，ear.js 三入口 + 播放排程修复）；整合时顺带修复三个既有 bug：getDashboard 未 toPlain（HashMap→Map 致全站章节进度不显示）、fifths.js pretty() 把裸 b/bb 错转 ♭、首页 melody svg 因 VexFlow 内联宽导致移动端溢出

- ✅ **2026-10-29 第四波体验收尾**：**PWA 应用壳**（vite-plugin-pwa：manifest+5 张图标、SW=dist/sw.js——precache 应用壳 12 项约 2.6MB + Maple 字体 CacheFirst 运行时缓存 + 同源 GET NetworkFirst；构建注入注册脚本，无需手动接线；采样仍走外部 CDN，断网 audio.js 合成兜底自动接管）；**钢琴多点触控修复**（piano.js 重构为容器级 pointerdown + document 级 move/up/cancel 的 pointerId 登记表 + pressCount 引用计数 + elementFromPoint 滑键，修掉双指丢音/粘键/右键误触发三类根因；合成多指针 15/15 通过，真机待回归）；**键位映射浮层**（钢琴聚焦按 `?` 弹出：role=dialog+aria-modal、焦点圈定与还原、Esc/遮罩/关闭钮可关、keyboard:false 实例不响应）；**练耳设置面板**（ear.js tabs 下一行：音量 0-100 velocity 等比缩放、节奏间隔倍率 0.5x-2x、调性 C/G/F/Bb——调性走 Rust 侧 gen_tonal_ear_in_key 生成所选大调 I–IV–V–I，出题判分逻辑不出前端；存 localStorage['xyy:ear-settings']；exercise.rs +7 单测，cargo test 65→72 全绿零警告）

## 更多文档

- **待办清单 [docs/TODO.md](TODO.md)** —— 可执行任务清单（每日挑战/错题本/查询器/节拍器已于 2026-10-28 上线），完成即勾
- **课程扩展计划书 [docs/ROADMAP.md](ROADMAP.md)** —— 2026-10-25 审计记录（7 项已修复，含 scroll-behavior:smooth 在部分 webview 导致全站滚动失效的根因）+ 五批次扩展计划（章节加深 / 五度圈与旋律写作新章 / 练习系统扩展 / 曲式编曲项目课 / 工具页与特色内容）。接手后续开发从它开始。

## 待办（后续增强，非必需）

- ✅ 2026-10-25 二批：**Gist 云同步**（首页 ☁ 面板：GitHub/Gitee 令牌 + 自动建 Gist + 合并式拉取；mergeDocs 双向取大；已端到端实测）
- ✅ 2026-10-25 一批：**音乐乐园 `#/fun`**、**吉他指板 `fretboard.js`**、**自动部署**（Pages=https://halacrcrc.github.io/XueYinYue/）
- 教学增强：节奏听辨题、和弦转位教学、五度圈工具页、更多调性（小调练耳）
- PWA 离线：自托管 smplr 采样到 dist/（应用壳 SW+manifest+图标已于 2026-10-29 上线；采样仍在 gleitz/smpldsnds 等 CDN，断网自动降级合成音色）
- ✅ 2026-10-29：键盘映射提示浮层（钢琴聚焦按 `?` 弹出）、移动端钢琴多点触控修复（pointerId 登记表）

> 决策记录（2026-10-25）：**RustySynth 全 Rust 音色引擎已评估并否决**——Web Audio 本身即原生管线，
> smplr 只做采样触发，无性能可赚；换它需打包数 MB 的 .sf2 并改造 AudioWorklet（全项目最难调试处）。
> 若将来要完全离线，正确做法是**自托管 smplr 采样文件到 dist/**，而非换引擎。
> 仅当需要 128 种乐器或自定义合成（FM 等）时才重新评估。

1. **阶段5 收尾**：写 `web/src/content/ch6.js`（调内和弦/级数/进行/名曲重建/移调实验室/quiz）；components.css 补 `.diatonic-grid/.diatonic-btn/.prog-info/.keytool-*`；main.js `CHAPTER_CONTENT` 加 `6: ch6`；浏览器验证
2. **阶段6**：练耳训练场（#/ear 独立页：调性级数模式[先播 I-IV-V-I 建立调中心再答题]+四向矩阵+统计）；progress.rs（掌握度算法+间隔重复+每日目标+热力图）+ localStorage 进度文档 + 导出/导入 JSON；首页旋律图接真进度
3. **阶段7**：移动端走查、（可选）音乐乐园沙盒、`npm run build` 产物部署脚本（静态托管）
4. 长期：2/4 拍听辨题、和弦转位教学、吉他指板扩展、RustySynth 全 Rust 音色

## 已知坑（避免重踩）

- **serde-wasm-bindgen 的 HashMap → JS Map**：`JSON.stringify(Map)` 得 `"{}"`。progress.js 的 `toPlain()` 深度转普通对象后再落盘/导出；新写代码凡从 wasm 拿 Map 结构都要走它——`getDashboard()` 的 DashboardDto.chapter_counts 也踩过此坑（曾致首页旋律图/目录页进度全不亮，2026-10-29 已修）
- `wasm-pack --out-dir` 相对 **crate 目录**解析，须写 `../web/src/wasm`
- 新版 wasm-bindgen 导出名保持 snake_case（前端 import `core_version` 而非 `coreVersion`）
- smplr：`SplendidGrandPiano(ctx)` 可不加 new；`piano.ready` 是 Promise；音符名科学记谱（C4=60）✓
- IAB `fullPage` 截图会把 sticky 顶栏拼进每段，视觉分析会误报"内容重复"——走查用视口截图/clip
- 中文字符串注意引号配对（ch2.js 曾因 `'…。"` 炸掉整页）；Vite 报错看 `/tmp/vite-dev.log`
- 首页旋律图 `buildMelodyMap(container, progress)` 已改用 VexFlow：progress 态 `unstarted/active/done` → 空心二分/四分/实心四分音符；点击音符进章节（SVG group 上挂事件）
- 章节完成态已迁移进统一进度文档（`localStorage['xyy:progress']`，key `chapters`）；旧 `xyy:done:*` 键在 markLessonDone 时自动迁移后删除
- Question 对象前端会挂 `_t0`（作答起点时间）再传回 check_answer——Rust 侧 serde 默认忽略未知字段，勿加 `deny_unknown_fields`
- **勿用 `scroll-behavior:smooth` 与 `scrollIntoView({behavior:'smooth'})`**：部分内嵌浏览器实现失效会卡死一切滚动；统一 `window.scrollTo(x, y)`
- **钢琴组件陷阱**：`createPiano` 把 `.piano` 类加在传入容器自身（`el.classList.add('piano')`），所以 `.piano-mount .piano` 这种**后代选择器永远匹配不到**
- **钢琴指针事件已改为 pointerId 登记表管理**（2026-10-29：容器级 pointerdown + document 级 move/up/cancel、activePointers 登记 + pressCount 引用计数）——改钢琴交互勿回退成 per-key 监听（会复发双指丢音/粘键）；`onDocKey` 有 isEditableTarget 守卫（输入框打字不再触发演奏），音符键 keydown 带 preventDefault（挡 Firefox `/` quick-find），要旧行为删这两处即可
- 开发中浏览器测试若"改了代码没生效"：多为 IAB 标签页持有旧模块图（hash 跳转不重载页面），重启 vite + 硬重载标签页即可
- **VexFlow `renderer.resize()` 会给 svg 写内联固定宽高**，压过 `.melody-fig svg { width:100% }`——dashboard.js 现以 wrap 的 `overflow-x:auto` 兜底（移动端容器内滑动，同 .lesson-list 模式），改动旋律图宽度时留意
- 部署（静态托管，可选）：`npm run build` 后 `web/dist/` 即全静态产物（base 已设 `./`），可直接丢任意静态服务器；PWA 已上线（SW 由 vite build 注入注册脚本），应用壳可离线，首次加载采样需联网（smplr CDN，离线自动降级合成音色）

## 验证清单（每阶段跑一遍）

1. `cargo test` 全绿零警告
2. `npx vite build` 通过
3. 浏览器实测：首页 → 各章节能开、能发声、quiz 判分反馈正确
4. 更新本文档的"已完成/待办"
