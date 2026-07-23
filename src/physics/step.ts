import { integrate } from './integrator.js'
import { solveConstraint } from './constraints.js'
import { createSpatialHash, updateSpatialHash, detectAndResolve } from './collision.js'
import { solveBounds } from './bounds.js'
import { applyInteractions } from './interactions.js'
import { checkSleep } from './sleep.js'
import type { World, Interaction } from './types.js'

export function step(world: World, dt: number, interactions?: Interaction[]): void {
  if (interactions && interactions.length > 0) {
    applyInteractions(world, interactions)
  }

  for (const body of world.bodies) {
    if (!body.sleeping && !body.dead) {
      integrate(body, world.config.gravity, world.config.damping, dt)
    }
  }

  if (!world._hash) world._hash = createSpatialHash(24)
  updateSpatialHash(world._hash, world.bodies)

  // Force-based constraints (springs) run once to avoid accumulating N*iterations force
  for (const conn of world.connections) {
    if (!conn.broken && conn.type === 'spring') solveConstraint(conn, world.bodies)
  }

  // Position-based constraints benefit from multiple iterations for stability
  for (let i = 0; i < world.config.iterations; i++) {
    for (const conn of world.connections) {
      if (!conn.broken && conn.type !== 'spring') solveConstraint(conn, world.bodies)
    }
    detectAndResolve(world._hash, world.bodies, world._checked)
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
