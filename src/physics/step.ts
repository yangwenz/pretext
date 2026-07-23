import { integrate } from './integrator.js'
import { solveConstraint } from './constraints.js'
import { createSpatialHash, updateSpatialHash, detectAndResolve, type SpatialHash } from './collision.js'
import { solveBounds } from './bounds.js'
import { applyInteractions } from './interactions.js'
import { checkSleep } from './sleep.js'
import type { World, Interaction } from './types.js'

let hash: SpatialHash | null = null

export function step(world: World, dt: number, interactions?: Interaction[]): void {
  if (interactions && interactions.length > 0) {
    applyInteractions(world, interactions)
  }

  for (const body of world.bodies) {
    if (!body.sleeping && !body.dead) {
      integrate(body, world.config.gravity, world.config.damping, dt)
    }
  }

  if (!hash) hash = createSpatialHash(24)
  updateSpatialHash(hash, world.bodies)

  for (let i = 0; i < world.config.iterations; i++) {
    for (const conn of world.connections) {
      if (!conn.broken) solveConstraint(conn, world.bodies)
    }
    detectAndResolve(hash, world.bodies)
    if (world.config.bounds) {
      for (const body of world.bodies) {
        if (!body.dead && body.mass !== Infinity) {
          solveBounds(body, world.config.bounds)
        }
      }
    }
  }

  for (const body of world.bodies) {
    if (!body.dead && body.mass !== Infinity) {
      checkSleep(body, world.config)
    }
  }
}
