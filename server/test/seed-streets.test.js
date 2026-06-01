import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { extractLines, parseRows, districtsFromCell } from '../src/seeds/parse-streets.js'

const DOCX = fileURLToPath(new URL('../src/seeds/9609544.docx', import.meta.url))

describe('parse-streets', () => {
  it('districtsFromCell разносит пересекающие округа', () => {
    const d = districtsFromCell('Центральный внутригородской округ, Карасунский внутригородской округ')
    expect(d.map((x) => x.name)).toEqual(['Карасунский округ', 'Центральный округ'])
  })

  it('парсит реальный реестр (>1500 улиц, 4 городских округа)', async () => {
    const lines = await extractLines(DOCX)
    const rows = parseRows(lines)
    expect(rows.length).toBeGreaterThan(1500)
    const cityNames = new Set(rows.flatMap((r) => r.districts).map((d) => d.name))
    for (const n of ['Прикубанский округ', 'Карасунский округ', 'Центральный округ', 'Западный округ']) {
      expect(cityNames.has(n)).toBe(true)
    }
  })
})
