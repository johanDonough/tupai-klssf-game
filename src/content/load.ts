import type { BoardDef, CardFile, Content, GameConfig, Tuning, WaveFile } from './types'

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(import.meta.env.BASE_URL + path)
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`)
  return response.json() as Promise<T>
}

export async function loadContent(): Promise<Content> {
  const [tuning, boardFile, cards, waves, config] = await Promise.all([
    getJson<Tuning>('content/tuning.json'),
    getJson<{ boards: BoardDef[] }>('content/boards.json'),
    getJson<CardFile>('content/cards.json'),
    getJson<WaveFile>('content/waves.json'),
    getJson<GameConfig>('content/config.json'),
  ])
  return { tuning, boards: boardFile.boards, cards, waves, config }
}

export function contentUrl(name: string): string {
  return import.meta.env.BASE_URL + 'content/' + name
}

export function iconUrl(name: string): string {
  return import.meta.env.BASE_URL + 'icons/' + name + '.svg'
}

export function artUrl(name: string): string {
  return import.meta.env.BASE_URL + 'art/' + name
}
