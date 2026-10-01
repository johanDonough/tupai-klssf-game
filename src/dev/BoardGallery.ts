import { Text, type Application } from 'pixi.js'
import type { Art } from '../content/art'
import type { Content } from '../content/types'
import { PourSim } from '../pour/PourSim'
import { PourView, PX } from '../pour/PourView'
import { makeRng } from '../rng'
import { colour, font } from '../theme'

// Every board side by side, for checking layouts: open the game with ?boards.

export class BoardGallery {
  constructor(app: Application, content: Content, art: Art) {
    const b = content.tuning.board
    const columns = Math.max(1, Math.floor(app.screen.width / 220))
    const scale = Math.min(0.24, (app.screen.width / columns - 16) / (b.width * PX))
    const cellW = b.width * PX * scale + 16
    const cellH = b.height * PX * scale + 40
    content.boards.forEach((board, i) => {
      const sim = new PourSim({ board, tuning: content.tuning, startNuts: 12, rng: makeRng(3) })
      const view = new PourView(sim, art)
      const x = (i % columns) * cellW + 8
      const y = Math.floor(i / columns) * cellH + 32
      view.root.scale.set(scale)
      view.root.position.set(x, y)
      const label = new Text({
        text: `${board.name} (tier ${board.tier})`,
        style: { fontFamily: font.heading, fontSize: 13, fill: colour.content },
      })
      label.position.set(x, y - 20)
      app.stage.addChild(view.root, label)
    })
  }
}
