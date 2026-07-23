import type { Body, Vec2 } from './types.js'

export function integrate(body: Body, gravity: Vec2, damping: number, dt: number): void {
  if (body.mass === Infinity || body.mass <= 0 || body.dead || body.sleeping) return

  const ax = body.force.x / body.mass + gravity.x
  const ay = body.force.y / body.mass + gravity.y

  body.velocity.x = (body.velocity.x + ax * dt) * damping
  body.velocity.y = (body.velocity.y + ay * dt) * damping

  const inertia = body.mass * (body.width * body.width + body.height * body.height) / 12
  body.angularVelocity = (body.angularVelocity + body.torque / inertia * dt) * damping

  body.position.x += body.velocity.x * dt
  body.position.y += body.velocity.y * dt
  body.angle += body.angularVelocity * dt

  body.force.x = 0
  body.force.y = 0
  body.torque = 0
}
