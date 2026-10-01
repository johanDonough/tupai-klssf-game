import { Assets, Texture } from 'pixi.js'
import { artUrl } from './load'

// Every picture the game shows is named in public/art/manifest.json, which
// tools/build_art.py writes. A CMS can later write the same file.

export interface ArtEntry {
  file: string
  width: number
  height: number
}

export type ArtManifest = Record<string, ArtEntry>

/** What the pour board needs before it can be shown. */
export const POUR_ART = ['nut', 'nut-super', 'cup', 'basket', 'fx-sparkle']

export class Art {
  private readonly textures = new Map<string, Texture>()

  private constructor(private readonly manifest: ArtManifest) {}

  static async load(): Promise<Art> {
    const response = await fetch(artUrl('manifest.json'))
    if (!response.ok) throw new Error(`Could not load the art list (${response.status})`)
    return new Art((await response.json()) as ArtManifest)
  }

  /** Downloads the named pictures. Safe to call again for ones already loaded. */
  async preload(names: string[]): Promise<void> {
    const missing = names.filter((name) => !this.textures.has(name))
    await Promise.all(
      missing.map(async (name) => {
        this.textures.set(name, await Assets.load<Texture>(artUrl(this.entry(name).file)))
      }),
    )
  }

  has(name: string): boolean {
    return name in this.manifest
  }

  texture(name: string): Texture {
    const texture = this.textures.get(name)
    if (!texture) throw new Error(`Picture "${name}" was used before it was loaded`)
    return texture
  }

  /** Width divided by height, from the manifest. */
  aspect(name: string): number {
    const { width, height } = this.entry(name)
    return width / height
  }

  names(prefix = ''): string[] {
    return Object.keys(this.manifest).filter((name) => name.startsWith(prefix))
  }

  private entry(name: string): ArtEntry {
    const entry = this.manifest[name]
    if (!entry) throw new Error(`No picture called "${name}" in the art list`)
    return entry
  }
}
