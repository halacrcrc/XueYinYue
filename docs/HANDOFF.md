# 学音乐（XueYinYue）交接文档

> 本文档是活文档：**每完成一个阶段必须更新**。接手的模型/人请从这里开始。
> 最后更新：**阶段 0–7 全部完成**（初版功能全量上线，47 个 Rust 测试全绿，生产构建通过）

## 项目一句话

中文互动乐理学习 Web 应用（对标 learningmusic.ableton.com），**Rust/WASM 做全部乐理计算与判分，Web Audio 发声（真实采样+合成兜底），原生 JS 无框架前端**。用户是乐理小白（本人不写代码，由 AI 全部实现）。

## 环境与命令

- Windows + Git Bash；Rust 1.98 + `wasm32-unknown-unknown`；wasm-pack 0.15.0（装在 `~/.cargo/bin`）；Node 24 / npm 11
- **网络代理**：npm 已配置 `127.0.0.1:10808`（HTTP 模式）；cargo/curl 需临时 `export HTTPS_PROXY=http://127.0.0.1:10808`
- 启动开发：`cd D:\XueYinYue\web && npm run dev` → http://localhost:5173
- 重编 Rust → WASM：`npm run build:wasm`（在 web/ 下）；改页面代码 Vite 热更新
- Rust 测试：`cd core && cargo test`（当前 **42 个测试全绿，零警告**）
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
               jianpu_for_note/keyboard_layout/gen_question/check_answer
web/    Vite + 原生 JS
  audio.js       双层声音引擎：合成兜底(钢琴+鼓) + smplr(SplendidGrandPiano/DrumMachine TR-808)
  piano.js       钢琴组件：点击/电脑键盘(可关)/高亮/标签(音名|简谱|无)/flash/demonstrate
  staff.js       VexFlow 五线谱封装（key 格式 "c/4"，小写）
  jianpu.js      简谱渲染（唱名七色）
  waves.js       波形可视化（Canvas，频率比教学，IO暂停+reduced-motion静态）
  sequencer.js   16格×4鼓步进音序器（lookahead调度、播放头动效、BPM）
  tap-trainer.js 跟打练习（预备4拍+8拍，毫秒误差评分）
  lesson.js      微课引擎：块类型 p/callout/waves/staff/jianpu/demo/sequencer/tap/
                 diatonic/progression/keytool/quiz；章节渲染+课内导航+localStorage完成态
  content/*.js   章节内容（数据驱动）：ch1 声音与音名、ch2 节奏、ch3 音阶、ch4 音程、ch5 和弦
  dashboard.js   首页课程旋律图（SVG五线谱+七音符，SVG <a> 链接）
  pages/home.js  首页（hero+旋律图+可弹钢琴+标签chips）
  main.js        hash 路由：#/ 、#/chapter/N（1-6）、#/ear（占位）
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

## 待办（后续增强，非必需）

- ✅ 2026-10-25 二批：**旋律图音符加厚**（4px 描边+章节色实心底）；**Gist 云同步**（首页 ☁ 面板：GitHub/Gitee 令牌 + 自动建 Gist + 合并式拉取；mergeDocs 双向取大；已端到端实测）
- ✅ 2026-10-25 一批：**音乐乐园 `#/fun`**、**吉他指板 `fretboard.js`**、**自动部署**（Pages=https://halacrcrc.github.io/XueYinYue/）
- 教学增强：节奏听辨题、和弦转位教学、五度圈工具页、更多调性（小调练耳）
- PWA 离线：自托管 smplr 采样 + Service Worker（约 1 小时）
- 键盘映射提示浮层、移动端钢琴多点触控优化

> 决策记录（2026-10-25）：**RustySynth 全 Rust 音色引擎已评估并否决**——Web Audio 本身即原生管线，
> smplr 只做采样触发，无性能可赚；换它需打包数 MB 的 .sf2 并改造 AudioWorklet（全项目最难调试处）。
> 若将来要完全离线，正确做法是**自托管 smplr 采样文件到 dist/**，而非换引擎。
> 仅当需要 128 种乐器或自定义合成（FM 等）时才重新评估。

1. **阶段5 收尾**：写 `web/src/content/ch6.js`（调内和弦/级数/进行/名曲重建/移调实验室/quiz）；components.css 补 `.diatonic-grid/.diatonic-btn/.prog-info/.keytool-*`；main.js `CHAPTER_CONTENT` 加 `6: ch6`；浏览器验证
2. **阶段6**：练耳训练场（#/ear 独立页：调性级数模式[先播 I-IV-V-I 建立调中心再答题]+四向矩阵+统计）；progress.rs（掌握度算法+间隔重复+每日目标+热力图）+ localStorage 进度文档 + 导出/导入 JSON；首页旋律图接真进度
3. **阶段7**：移动端走查、（可选）音乐乐园沙盒、`npm run build` 产物部署脚本（静态托管）
4. 长期：2/4 拍听辨题、和弦转位教学、吉他指板扩展、RustySynth 全 Rust 音色

## 已知坑（避免重踩）

- **serde-wasm-bindgen 的 HashMap → JS Map**：`JSON.stringify(Map)` 得 `"{}"`。progress.js 的 `toPlain()` 深度转普通对象后再落盘/导出；新写代码凡从 wasm 拿 Map 结构都要走它
- `wasm-pack --out-dir` 相对 **crate 目录**解析，须写 `../web/src/wasm`
- 新版 wasm-bindgen 导出名保持 snake_case（前端 import `core_version` 而非 `coreVersion`）
- smplr：`SplendidGrandPiano(ctx)` 可不加 new；`piano.ready` 是 Promise；音符名科学记谱（C4=60）✓
- IAB `fullPage` 截图会把 sticky 顶栏拼进每段，视觉分析会误报"内容重复"——走查用视口截图/clip
- 中文字符串注意引号配对（ch2.js 曾因 `'…。"` 炸掉整页）；Vite 报错看 `/tmp/vite-dev.log`
- 首页旋律图 `buildMelodyMap(container, progress)` 已支持进度态 `unstarted/active/done`（点音符填充色），接进度系统时用
- 章节完成态已迁移进统一进度文档（`localStorage['xyy:progress']`，key `chapters`）；旧 `xyy:done:*` 键在 markLessonDone 时自动迁移后删除
- Question 对象前端会挂 `_t0`（作答起点时间）再传回 check_answer——Rust 侧 serde 默认忽略未知字段，勿加 `deny_unknown_fields`
- 部署（静态托管，可选）：`npm run build` 后 `web/dist/` 即全静态产物（base 已设 `./`），可直接丢 GitHub Pages / Netlify / 任意静态服务器；首次加载采样需联网（smplr CDN），缓存后离线可用

## 验证清单（每阶段跑一遍）

1. `cargo test` 全绿零警告
2. `npx vite build` 通过
3. 浏览器实测：首页 → 各章节能开、能发声、quiz 判分反馈正确
4. 更新本文档的"已完成/待办"
