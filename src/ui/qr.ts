import qrcode from 'qrcode-generator'

/** A QR code for `text` as an SVG string, dark squares in brand black. */
export function qrSvg(text: string): string {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const count = qr.getModuleCount()
  const quiet = 2
  const size = count + quiet * 2
  let path = ''
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) path += `M${col + quiet} ${row + quiet}h1v1h-1z`
    }
  }
  return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code for the claim page" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#1b1b1b"/></svg>`
}
