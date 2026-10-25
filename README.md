# 学音乐 · XueYinYue

边玩边学的中文互动乐理课 —— **Rust + WebAssembly** 做乐理引擎，浏览器原生 Web Audio 发声（真实大钢琴采样 + TR-808 鼓机），无需账号、无需后端，打开就能弹。

对标 [Ableton Learning Music](https://learningmusic.ableton.com/zh-Hans/index.html) 的"边玩边学"体验，并融合了 musictheory.net 的四向练习矩阵、Lightnote 的波形可视化教学与 Functional Ear Trainer 的调性练耳方法。

## 课程一览

| 章节 | 学什么 | 特色互动 |
|---|---|---|
| 一 · 声音与音名 | 振动、钢琴地图、音名、唱名与简谱 | 动态波形、唱名七色琴键 |
| 二 · 节奏与节拍 | 拍 / BPM / 拍号、时值、风格节奏型 | 步进音序器、跟打毫秒评分 |
| 三 · 音阶 | 五声先行、半音全音、大小调公式 | 键盘高亮、移调演示 |
| 四 · 音程 | 度数与半音、协和与不协和 | 频率比波形可视化（3:2 为什么协和） |
| 五 · 和弦 | 大 / 小 / 增 / 减三和弦 | 听辨 + 亲手搭和弦 |
| 六 · 和声进行 | 级数思维、经典进行、移调 | 七和弦点听、进行自动演奏、八调移调实验室 |
| 练耳训练场 | 调性级数 / 音程 / 和弦 | 先播 I–IV–V–I 建立调中心再答题 |

## 特性

- **乐理对错全部由 Rust 保证** —— 音程、音阶、和弦、简谱、出题与判分都在 WASM 引擎里实现，47 个单元测试全绿
- **双层声音引擎** —— 页面一打开就能发声（Web Audio 合成兜底），真实采样（Splendid Grand Piano / TR-808）流式加载完成后无缝接管
- **颜色即乐理** —— 唱名七色体系（红 do、橙 re、黄 mi、绿 fa、蓝 sol、紫 la、粉 si）贯穿琴键、简谱、五线谱与课程进度，认住颜色就认住了音
- **学习进度系统** —— 掌握度算法、答错次日复习的间隔重复、连续天数、12 周热力图、每日目标；数据存本机，一键导出 / 导入 JSON 备份
- **设计有手感** —— 暖纸白晨光练习室视觉、衬线大标题、弹簧曲线的琴键按压反馈；尊重 `prefers-reduced-motion`，触控目标 ≥ 44px

## 快速开始

```bash
git clone https://github.com/halacrcrc/XueYinYue.git
cd XueYinYue/web
npm install        # 首次需要联网（含采样 CDN）
npm run dev        # 打开 http://localhost:5173
```

环境要求：Node.js ≥ 20、Rust（含 `wasm32-unknown-unknown` 目标）、wasm-pack。

## 常用命令（都在 `web/` 目录下）

| 命令 | 作用 |
|---|---|
| `npm run dev` | 编译 WASM 并启动开发服务器（热更新） |
| `npm run build:wasm` | 仅重编 Rust 核心（改了 `core/` 之后执行） |
| `npm run build` | 生产构建，产物在 `web/dist/`（全静态，可直接托管） |

Rust 侧测试：`cd core && cargo test`

## 技术架构

```
core/   Rust 乐理引擎 → WebAssembly
        note / interval / scale / chord / jianpu     乐理计算（纯逻辑，全单测）
        exercise                                      四向练习矩阵出题 + 判分
        progress                                      掌握度、间隔重复、学习日历
web/    Vite + 原生 JS（无框架）
        audio.js        双层声音引擎（合成兜底 + smplr 采样）
        piano.js        交互钢琴（点击/电脑键盘/高亮/唱名着色）
        lesson.js       微课引擎（讲解/演示/练习块渲染）
        sequencer.js    16 格步进音序器    tap-trainer.js  跟打评分
        staff.js        VexFlow 五线谱     jianpu.js       简谱渲染
        progress.js     进度存取           pages/          首页 / 练耳训练场
docs/   HANDOFF.md     交接文档（架构、API、设计规范、已知坑）
```

**职责铁律**：所有"对错与分析"只发生在 Rust（带单元测试）；JS 只做呈现、发声与存取。

## 部署

`npm run build` 后 `web/dist/` 为全静态产物（`base` 已设为 `./`），可直接部署到 GitHub Pages / Netlify / Vercel 或任意静态服务器。首次使用需联网加载乐器采样，浏览器缓存后即可离线弹奏。

## 更多文档

- [交接文档 docs/HANDOFF.md](docs/HANDOFF.md) —— 架构决策、WASM 接口速查、设计规范、已知坑与后续增强清单

## 许可

本项目代码以 [MIT License](LICENSE) 开源；乐器采样来自 [smplr](https://github.com/danigb/smplr)（MIT）及其采样资源（CC 授权），字体为思源黑体 / 思源宋体（SIL OFL）。
