// 简谱渲染：数字 + 八度点（上·高 / 下·低）+ 变音记号（♯/♭），唱名七色着色。
// items: [{ digit: 1-7, octaveOffset: -1|0|1, accidental: -1|0|1, solfege?: 'do' }]

const DEGREE_VARS = ['--do', '--re', '--mi', '--fa', '--sol', '--la', '--si']

export function renderJianpu(el, items, { caption } = {}) {
  el.innerHTML = ''
  el.classList.add('jianpu-fig')
  const row = document.createElement('div')
  row.className = 'jianpu-row'
  for (const it of items) {
    const cell = document.createElement('span')
    cell.className = 'jianpu-cell'
    cell.style.setProperty('--jp', `var(${DEGREE_VARS[(it.digit - 1) % 7]})`)
    if (it.octaveOffset < 0) {
      const lo = document.createElement('i')
      lo.className = 'jp-dots below'
      lo.textContent = '·'.repeat(-it.octaveOffset)
      cell.appendChild(lo)
    }
    const num = document.createElement('b')
    num.textContent = `${it.accidental > 0 ? '♯' : it.accidental < 0 ? '♭' : ''}${it.digit}`
    cell.appendChild(num)
    if (it.octaveOffset > 0) {
      const hi = document.createElement('i')
      hi.className = 'jp-dots above'
      hi.textContent = '·'.repeat(it.octaveOffset)
      cell.appendChild(hi)
    }
    row.appendChild(cell)
  }
  el.appendChild(row)
  if (caption) {
    const cap = document.createElement('p')
    cap.className = 'fig-caption'
    cap.textContent = caption
    el.appendChild(cap)
  }
}

/** 从 Rust scale DTO 的 notes 提取简谱项（notes[].jianpu） */
export function jianpuItemsFromScale(scaleDto, { includeOctaveTonic = true } = {}) {
  const items = []
  for (const n of scaleDto.notes) {
    if (!n.jianpu) continue
    if (!includeOctaveTonic && n.jianpu.octaveOffset > 0) continue
    items.push({
      digit: n.jianpu.digit,
      octaveOffset: n.jianpu.octaveOffset,
      accidental: n.jianpu.accidental,
      solfege: n.jianpu.solfege,
    })
  }
  return items
}
