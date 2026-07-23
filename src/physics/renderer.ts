import type { World } from './types.js'

export function render(ctx: CanvasRenderingContext2D, world: World): void {
  const bodies = world.bodies
  const len = bodies.length

  // Build visible list in-place reusing world._renderOrder
  if (!world._renderOrder || world._renderOrder.length < len) {
    world._renderOrder = new Array(len)
  }
  let count = 0
  for (let i = 0; i < len; i++) {
    const b = bodies[i]!
    if (!b.dead) world._renderOrder[count++] = b
  }

  // Sort by z-index
  const order = world._renderOrder
  for (let i = 1; i < count; i++) {
    const item = order[i]!
    let j = i - 1
    while (j >= 0 && order[j]!.z > item.z) {
      order[j + 1] = order[j]!
      j--
    }
    order[j + 1] = item
  }

  let lastFont = ''
  for (let i = 0; i < count; i++) {
    const body = order[i]!
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
