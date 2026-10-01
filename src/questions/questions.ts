import type { Rng } from '../rng'

// Where maths questions come from, and what happens to the answers.
//
// Today the questions are a file (public/content/questions.json, built by
// questions/build_bank.py). A QuestionSource that asks an API instead, for
// example one backed by FalkorDB, can replace FileQuestionSource without the
// game noticing, as long as it returns the same Question shape.

export interface Question {
  id: string
  tier: number
  op: '+' | '-' | 'x' | '/'
  family: string
  text: string
  answer: number
  /** Three wrong answers, for multiple choice. */
  wrong: number[]
  /** Short enough to type on the number pad in time. */
  pad: boolean
}

export type AnswerFormat = 'choice' | 'typed'

export interface QuestionRequest {
  tier: number
  format: AnswerFormat
}

export interface QuestionSource {
  next(request: QuestionRequest): Promise<Question>
  /** Called at the start of each run, so questions do not repeat within one. */
  newRun(): void
}

/** What the game reports for every question asked. */
export interface AnswerRecord {
  questionId: string
  text: string
  answer: number
  given: number | null
  correct: boolean
  milliseconds: number
  format: AnswerFormat
  /** What the answer was for: a card, a reroll, "get all", a revive. */
  reward: string
  wave: number
}

/** Name of the browser event raised on window for every answer. */
export const ANSWER_EVENT = 'tupai-nutty-hero:answer'

export function reportAnswer(record: AnswerRecord): void {
  window.dispatchEvent(new CustomEvent<AnswerRecord>(ANSWER_EVENT, { detail: record }))
}

/** Question difficulty for a wave: 1 early, 2 in the middle, 3 late. */
export function tierForWave(wave: number, format: AnswerFormat): number {
  const tier = wave <= 5 ? 1 : wave <= 10 ? 2 : 3
  // Typing takes longer than tapping, so typed questions are one tier easier.
  return format === 'typed' ? Math.max(1, tier - 1) : tier
}

export class FileQuestionSource implements QuestionSource {
  private readonly asked = new Set<string>()

  private constructor(
    private readonly questions: Question[],
    private readonly rng: Rng,
  ) {}

  static async load(url: string, rng: Rng): Promise<FileQuestionSource> {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Could not load the questions (${response.status})`)
    return new FileQuestionSource((await response.json()) as Question[], rng)
  }

  newRun(): void {
    this.asked.clear()
  }

  async next({ tier, format }: QuestionRequest): Promise<Question> {
    const fits = (q: Question) => q.tier === tier && (format === 'choice' || q.pad)
    // The kind of sum first (add, take away, times, divide: whichever this
    // bank has, all equally likely), then a question, so none swamps the rest.
    const ops = [...new Set(this.questions.filter(fits).map((q) => q.op))]
    for (let i = ops.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1))
      ;[ops[i], ops[j]] = [ops[j], ops[i]]
    }
    for (const op of ops) {
      const pool = this.questions.filter((q) => fits(q) && q.op === op && !this.asked.has(q.id))
      if (pool.length > 0) return this.take(pool)
    }
    // Every fitting question has been asked this run: start that pool again.
    const pool = this.questions.filter(fits)
    for (const q of pool) this.asked.delete(q.id)
    return this.take(pool.length > 0 ? pool : this.questions)
  }

  private take(pool: Question[]): Question {
    const question = pool[Math.floor(this.rng() * pool.length)]
    this.asked.add(question.id)
    return question
  }
}
