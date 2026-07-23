import type { Body, Rect } from './types.js'

export function solveBounds(body: Body, bounds: Rect): void {
  if (body.dead || body.mass === Infinity) return

  const hw = body.width / 2
  const hh = body.height / 2

  // Left wall
  if (body.position.x - hw < bounds.x) {
    body.position.x = bounds.x + hw
    body.velocity.x *= -body.restitution
  }

  // Right wall
  if (body.position.x + hw > bounds.x + bounds.width) {
    body.position.x = bounds.x + bounds.width - hw
    body.velocity.x *= -body.restitution
  }

  // Top wall
  if (body.position.y - hh < bounds.y) {
    body.position.y = bounds.y + hh
    body.velocity.y *= -body.restitution
  }

  // Floor
  if (body.position.y + hh > bounds.y + bounds.height) {
    body.position.y = bounds.y + bounds.height - hh
    body.velocity.y *= -body.restitution
    body.velocity.x *= (1 - body.friction)
    body.angularVelocity *= (1 - body.friction)
  }
}
