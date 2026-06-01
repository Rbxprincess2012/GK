import unzipper from 'unzipper'

const CITY = ['Прикубанский', 'Карасунский', 'Центральный', 'Западный']
const RURAL = ['Калининский', 'Старокорсунский', 'Берёзовский', 'Елизаветинский', 'Пашковский']

export async function extractLines(docxPath) {
  const dir = await unzipper.Open.file(docxPath)
  const entry = dir.files.find((f) => f.path === 'word/document.xml')
  const xml = (await entry.buffer()).toString('utf8')
  return xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

// из строки «принадлежности» вытащить базовые округа (может быть несколько)
export function districtsFromCell(cell) {
  const found = []
  for (const name of [...CITY, ...RURAL]) {
    if (cell.includes(name)) {
      found.push({ name: `${name} округ`, kind: CITY.includes(name) ? 'city' : 'rural' })
    }
  }
  return found
}

// вернуть [{ street, districts:[{name,kind}] }]
export function parseRows(lines) {
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(ул\.|пер\.|пр\.|проезд|туп\.|ш\.|наб\.|б-р|мкр|пл\.)/)
    if (!m) continue
    const cell = lines.slice(i + 1, i + 5).find((l) => l.includes('округ'))
    if (!cell) continue
    const districts = districtsFromCell(cell)
    if (districts.length) out.push({ street: lines[i], districts })
  }
  return out
}
