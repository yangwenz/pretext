import type { Body, World } from './types.js'

export function checkSleep(body: Body, config: { sleepThresholdVel: number; sleepThresholdAng: number; sleepDelay: number }): void {
  if (body.dead || body.mass === Infinity) return

  const speed = Math.sqrt(body.velocity.x * body.velocity.x + body.velocity.y * body.velocity.y)
  if (speed < config.sleepThresholdVel && Math.abs(body.angularVelocity) < config.sleepThresholdAng) {
    body.sleepTimer++
    if (body.sleepTimer >= config.sleepDelay) {
      body.sleeping = true
    }
  } else {
    body.sleepTimer = 0
    body.sleeping = false
  }
}

export function wake(body: Body, world: World): void {
  if (!body.sleeping) return
  body.sleeping = false
  body.sleepTimer = 0
  for (const conn of world.connections) {
    if (conn.broken) continue
    if (conn.a === body.id) {
      const other = world.bodies[conn.b]
      if (other) wake(other, world)
    }
    if (conn.b === body.id) {
      const other = world.bodies[conn.a]
      if (other) wake(other, world)
    }
  }
}
