// ESLint JSON 결과를 GitHub Actions 주석(::error)으로 출력한다. 오류가 하나라도 있으면 exit 1.
// react-hooks v7 규칙은 메시지가 여러 줄이라 setup-node의 기본 problem matcher가 잡지 못해, PR 화면에 원인이 안 보였다.
// 사용: npx eslint . -f json -o eslint.json || true; node scripts/eslint-annotate.mjs eslint.json
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'

const reportPath = process.argv[2] || 'eslint.json'
let results
try {
  results = JSON.parse(readFileSync(reportPath, 'utf8'))
} catch (e) {
  // eslint 자체가 실패해 보고서가 없으면(설정 오류 등) 그것도 실패로 본다
  console.log(`::error title=eslint::eslint 결과(${reportPath})를 읽지 못했습니다: ${e.message}`)
  process.exit(1)
}

const escData = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
const escProp = (s) => escData(s).replace(/:/g, '%3A').replace(/,/g, '%2C')

let errors = 0
let warnings = 0
for (const r of results) {
  if (r.messages.length === 0) continue
  const file = relative(process.cwd(), r.filePath)
  // 주석은 step당 개수 제한이 있어 파일마다 하나로 묶고, 전체 목록은 로그에도 남긴다
  const lines = r.messages.map((m) => {
    const level = m.severity === 2 ? 'error' : 'warning'
    // 여러 줄 메시지(코드 프레임 포함)는 한 줄로 접고 길이를 제한한다
    const text = String(m.message).split('\n').map((l) => l.trim()).filter(Boolean).join(' / ').slice(0, 400)
    return `${m.line ?? 0}:${m.column ?? 0} ${level} [${m.ruleId ?? 'fatal'}] ${text}`
  })
  errors += r.errorCount
  warnings += r.warningCount
  console.log(`\n${file}\n  ${lines.join('\n  ')}`)
  const first = r.messages[0]
  const kind = r.errorCount > 0 ? 'error' : 'warning'
  console.log(
    `::${kind} file=${escProp(file)},line=${first.line ?? 1},col=${first.column ?? 1},title=${escProp(`eslint ${r.errorCount} error / ${r.warningCount} warning`)}::${escData(lines.join('\n'))}`,
  )
}

console.log(`\neslint: ${errors} error(s), ${warnings} warning(s)`)
process.exit(errors > 0 ? 1 : 0)
