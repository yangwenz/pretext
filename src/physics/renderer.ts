import type { World } from './types.js'

export function render(ctx: CanvasRenderingContext2D, world: World): void {
  const visible = []
  for (const body of world.bodies) {
    if (!body.dead) visible.push(body)
  }
  visible.sort((a, b) => a.z - b.z)

  let lastFont = ''
  for (const body of visible) {
    if (body.font !== lastFont) {
      ctx.font = body.font
      lastFont = body.font
    }
    ctx.save()
    ctx.translate(body.position.x, body.position.y)
    ctx.rotate(body.angle)
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText(body.char, 0, 0)
    ctx.restore()
  }
}
