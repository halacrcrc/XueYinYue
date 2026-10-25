// 生成 Maple Mono NF CN 切片字体（unicode-range 分片 woff2 + result.css）。
// 首次配置或更换字体版本时运行一次：
//   1. 从 maple-font releases 下载 MapleMonoNormal-NF-CN.zip 并解压
//   2. MAPLE_SRC=/tmp/maple node scripts/build-maple-fonts.mjs
// 产物提交进仓库（CI 无需重建字体）。

import { fontSplit } from 'cn-font-split'
import { rm } from 'node:fs/promises'

const JOBS = [
  { weight: '400', file: 'MapleMonoNormal-NF-CN-Regular.ttf' },
  { weight: '700', file: 'MapleMonoNormal-NF-CN-Bold.ttf' },
]
const SRC_DIR = process.env.MAPLE_SRC ?? '/tmp/maple'

for (const { weight, file } of JOBS) {
  const outDir = `src/fonts/maple-${weight}`
  console.log(`切割 ${file} → ${outDir} …`)
  await rm(outDir, { recursive: true, force: true })
  await fontSplit({
    input: `${SRC_DIR}/${file}`,
    outDir,
    css: { family: 'Maple Mono NF CN', weight, display: 'swap' },
    targetType: 'woff2',
    silent: true,
  })
  console.log(`完成 weight ${weight}`)
}
console.log('全部完成')
