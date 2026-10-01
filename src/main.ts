import '@fontsource/tilt-warp/400.css'
import '@fontsource/nunito-sans/400.css'
import '@fontsource/nunito-sans/600.css'
import '@fontsource/nunito-sans/700.css'
import './style.css'
import { mount } from './game'

declare global {
  interface Window {
    /** Handle for the browser console and automated checks. */
    nutGame?: Awaited<ReturnType<typeof mount>>
  }
}

mount(document.getElementById('game')!).then((game) => {
  window.nutGame = game
})
