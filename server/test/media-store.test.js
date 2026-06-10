import { describe, it, expect, afterAll } from 'vitest'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { put, putFromTelegram } from '../src/services/mediaStore.js'

const DIR = path.join(tmpdir(), 'putevo-media-test')
afterAll(() => rm(DIR, { recursive: true, force: true }))

describe('mediaStore', () => {
  it('put пишет файл и возвращает /media/<uuid>.<ext>', async () => {
    const url = await put(Buffer.from('hello'), 'txt', DIR)
    expect(url).toMatch(/^\/media\/.+\.txt$/)
    const name = url.replace('/media/', '')
    const content = await readFile(path.join(DIR, name), 'utf8')
    expect(content).toBe('hello')
  })

  it('putFromTelegram скачивает через мок fetch и сохраняет с верным расширением', async () => {
    const fetchImpl = async (u) => {
      if (u.includes('getFile')) return { json: async () => ({ result: { file_path: 'photos/file_1.jpg' } }) }
      return { arrayBuffer: async () => new TextEncoder().encode('IMGBYTES').buffer }
    }
    const url = await putFromTelegram('FILEID', { token: 't', fetchImpl, dir: DIR })
    expect(url).toMatch(/^\/media\/.+\.jpg$/)
  })

  it('putFromTelegram при ошибке getFile → бросает', async () => {
    const fetchImpl = async () => ({ json: async () => ({ ok: false }) })
    await expect(putFromTelegram('X', { token: 't', fetchImpl, dir: DIR })).rejects.toThrow()
  })
})
