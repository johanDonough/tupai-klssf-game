// Music and sound effects. One shared player for the whole game, so anything
// can call sound.play('hit') without being handed it.
//
// Which files exist and how loud each one plays lives in
// public/audio/manifest.json, so sounds can be swapped without touching code.
// Browsers only allow sound after the first tap, so nothing plays before it;
// a missing or broken file just stays silent.

export type SoundName =
  | 'throw'
  | 'hit'
  | 'crit'
  | 'foe-attack'
  | 'beaten'
  | 'nut-drop'
  | 'pour-gate'
  | 'bounce'
  | 'lock-break'
  | 'portal'
  | 'bank'
  | 'card-buy'
  | 'button'
  | 'correct'
  | 'wrong'
  | 'tick'
  | 'wave-start'
  | 'win'
  | 'lose'
  | 'revive'

interface Manifest {
  sounds: Record<string, string[]>
  volume?: Record<string, number>
}

/** Sounds that can fire many times a second play at most this often, in ms. */
const MIN_GAP: Partial<Record<SoundName, number>> = {
  'pour-gate': 45,
  bank: 60,
  'nut-drop': 50,
  hit: 40,
  throw: 60,
  portal: 80,
  bounce: 60,
}

const MUTE_KEY = 'tupai-nutty-hero:muted'

class Sound {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private manifest: Manifest | null = null
  private readonly buffers = new Map<string, AudioBuffer[]>()
  private readonly lastPlayed = new Map<string, number>()
  private music: AudioBufferSourceNode | null = null
  private musicGain: GainNode | null = null
  private wantMusic = false
  muted = readMuted()

  /** Reads the manifest. Call once at start; sounds load after the first tap. */
  async init(baseUrl: string): Promise<void> {
    this.base = baseUrl
    try {
      const response = await fetch(`${baseUrl}audio/manifest.json`)
      if (response.ok) this.manifest = (await response.json()) as Manifest
    } catch {
      // No sound this time; the game plays on.
    }
    const unlock = () => {
      this.unlock()
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('keydown', unlock, true)
    }
    window.addEventListener('pointerdown', unlock, true)
    window.addEventListener('keydown', unlock, true)
    document.addEventListener('visibilitychange', () => {
      if (!this.context) return
      if (document.hidden) void this.context.suspend()
      else void this.context.resume()
    })
  }

  private base = '/'

  private unlock(): void {
    if (this.context || !this.manifest) return
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Context) return
    this.context = new Context()
    this.master = this.context.createGain()
    this.master.gain.value = this.muted ? 0 : 1
    this.master.connect(this.context.destination)
    void this.context.resume()
    // Music first, so it is ready soonest; then everything else.
    const names = Object.keys(this.manifest.sounds).sort((a, b) => Number(b === 'bgm') - Number(a === 'bgm'))
    for (const name of names) void this.load(name)
  }

  private async load(name: string): Promise<void> {
    const files = this.manifest?.sounds[name] ?? []
    const loaded: AudioBuffer[] = []
    for (const file of files) {
      try {
        const response = await fetch(`${this.base}audio/${file}`)
        const data = await response.arrayBuffer()
        loaded.push(await this.context!.decodeAudioData(data))
      } catch {
        // Leave this one out.
      }
    }
    this.buffers.set(name, loaded)
    if (name === 'bgm' && this.wantMusic) this.startMusic()
  }

  play(name: SoundName, options: { rate?: number; volume?: number } = {}): void {
    const context = this.context
    if (!context || !this.master || this.muted) return
    const choices = this.buffers.get(name)
    if (!choices || choices.length === 0) return
    const now = performance.now()
    const gap = MIN_GAP[name] ?? 0
    if (gap && now - (this.lastPlayed.get(name) ?? -1e9) < gap) return
    this.lastPlayed.set(name, now)
    const source = context.createBufferSource()
    source.buffer = choices[Math.floor(Math.random() * choices.length)]
    // A little pitch wobble, so repeats don't sound copy-pasted.
    source.playbackRate.value = (options.rate ?? 1) * (0.94 + Math.random() * 0.12)
    const gain = context.createGain()
    gain.gain.value = (this.manifest?.volume?.[name] ?? 0.7) * (options.volume ?? 1)
    source.connect(gain).connect(this.master)
    source.start()
  }

  /** Background music on or off; it starts once it has loaded and sound is unlocked. */
  setMusic(on: boolean): void {
    this.wantMusic = on
    if (on) this.startMusic()
    else this.stopMusic()
  }

  private startMusic(): void {
    const context = this.context
    const buffer = this.buffers.get('bgm')?.[0]
    if (!context || !this.master || !buffer || this.music) return
    this.musicGain = context.createGain()
    this.musicGain.gain.value = 0
    this.musicGain.gain.linearRampToValueAtTime(this.manifest?.volume?.bgm ?? 0.35, context.currentTime + 1.5)
    this.music = context.createBufferSource()
    this.music.buffer = buffer
    this.music.loop = true
    this.music.connect(this.musicGain).connect(this.master)
    this.music.start()
  }

  private stopMusic(): void {
    const context = this.context
    if (!context || !this.music || !this.musicGain) return
    const music = this.music
    this.musicGain.gain.setTargetAtTime(0, context.currentTime, 0.25)
    music.stop(context.currentTime + 1)
    this.music = null
    this.musicGain = null
  }

  /** Lowers the music for `seconds`, e.g. under a jingle, then brings it back. */
  duck(seconds: number): void {
    const context = this.context
    if (!context || !this.musicGain) return
    const level = this.manifest?.volume?.bgm ?? 0.35
    const gain = this.musicGain.gain
    const now = context.currentTime
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(level * 0.25, now + 0.15)
    gain.setValueAtTime(level * 0.25, now + seconds)
    gain.linearRampToValueAtTime(level, now + seconds + 0.8)
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      // Not remembered this time.
    }
    if (this.master && this.context) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.05)
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export const sound = new Sound()
