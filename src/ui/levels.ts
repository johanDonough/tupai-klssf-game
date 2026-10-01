import type { LevelDef } from '../content/types'

// The difficulty buttons, shared by the title screen and the tutorial's last slide.

export function levelButtonsHtml(levels: LevelDef[]): string {
  return `<div class="level-list">${levels
    .map(
      (level) => `
        <button class="level-button level-${level.id}" data-level="${level.id}">
          <span class="level-name">${level.name}</span>
          <span class="level-tag">${level.label}</span>
          <span class="level-blurb">${level.blurb}</span>
        </button>`,
    )
    .join('')}</div>`
}

/** Resolves with the level whose button is tapped inside `root`. */
export function waitForLevel(root: HTMLElement, levels: LevelDef[]): Promise<LevelDef> {
  return new Promise((resolve) => {
    for (const button of root.querySelectorAll<HTMLButtonElement>('.level-button')) {
      button.onclick = (event) => {
        event.stopPropagation()
        resolve(levels.find((level) => level.id === button.dataset.level)!)
      }
    }
  })
}
