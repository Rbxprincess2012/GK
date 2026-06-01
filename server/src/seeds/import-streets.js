import { fileURLToPath } from 'node:url'
import { db } from '../db.js'
import { extractLines, parseRows } from './parse-streets.js'

export async function importStreets() {
  const docx = fileURLToPath(new URL('./9609544.docx', import.meta.url))
  const rows = parseRows(await extractLines(docx))
  const districtNames = [...new Map(
    rows.flatMap((r) => r.districts).map((d) => [d.name, d])).values()]
  await db.transaction(async (trx) => {
    for (const d of districtNames) {
      await trx('districts').insert(d).onConflict('name').ignore()
    }
    const idByName = Object.fromEntries(
      (await trx('districts').select('id', 'name')).map((d) => [d.name, d.id]))
    for (const r of rows) {
      for (const d of r.districts) {
        await trx('streets').insert({ name: r.street, district_id: idByName[d.name] })
      }
    }
  })
  return { districts: districtNames.length, streets: rows.length }
}

// запуск как скрипт: node src/seeds/import-streets.js
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('import-streets.js')) {
  importStreets()
    .then((r) => { console.log(`seed: ${r.districts} районов, ${r.streets} улиц(строк)`) })
    .catch((e) => { console.error(e); process.exitCode = 1 })
    .finally(() => db.destroy())
}
