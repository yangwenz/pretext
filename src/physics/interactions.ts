import type { Interaction, World } from './types.js'
import { wake } from './sleep.js'

export function applyInteraction(world: World, interaction: Interaction): void {
  switch (interaction.type) {
    case 'drag': {
      const body = world.bodies[interaction.bodyId]
      if (!body || body.mass === Infinity || body.dead) return
      if (body.sleeping) wake(body, world)
      const dx = interaction.target.x - body.position.x
      const dy = interaction.target.y - body.position.y
      body.force.x += dx * interaction.stiffness
      body.force.y += dy * interaction.stiffness
      break
    }
    case 'impulse': {
      for (const body of world.bodies) {
        if (body.mass === Infinity || body.dead) continue
        const dx = body.position.x - interaction.position.x
        const dy = body.position.y - interaction.position.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < interaction.radius && dist > 0) {
          const factor = (1 - dist / interaction.radius) * interaction.strength / body.mass
          body.velocity.x += (dx / dist) * factor
          body.velocity.y += (dy / dist) * factor
          if (body.sleeping) wake(body, world)
        }
      }
      break
    }
    case 'attractor': {
      for (const body of world.bodies) {
        if (body.mass === Infinity || body.dead) continue
        const dx = interaction.position.x - body.position.x
        const dy = interaction.position.y - body.position.y
        const distSq = dx * dx + dy * dy
        const dist = Math.sqrt(distSq)
        if (dist < 1) continue
        const f = interaction.falloff === 'linear'
          ? interaction.strength / dist
          : interaction.strength / distSq
        body.force.x += (dx / dist) * f
        body.force.y += (dy / dist) * f
        if (body.sleeping) wake(body, world)
      }
      break
    }
    case 'repulsor': {
      for (const body of world.bodies) {
        if (body.mass === Infinity || body.dead) continue
        const dx = body.position.x - interaction.position.x
        const dy = body.position.y - interaction.position.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist >= interaction.radius || dist < 0.001) continue
        const factor = (1 - dist / interaction.radius) * interaction.strength
        body.force.x += (dx / dist) * factor
        body.force.y += (dy / dist) * factor
        if (body.sleeping) wake(body, world)
      }
      break
    }
    case 'wind': {
      for (const body of world.bodies) {
        if (body.mass === Infinity || body.dead) continue
        if (interaction.region) {
          const r = interaction.region
          if (body.position.x < r.x || body.position.x > r.x + r.width ||
              body.position.y < r.y || body.position.y > r.y + r.height) continue
        }
        body.force.x += interaction.direction.x * interaction.strength
        body.force.y += interaction.direction.y * interaction.strength
        if (body.sleeping) wake(body, world)
      }
      break
    }
  }
}

export function applyInteractions(world: World, interactions: Interaction[]): void {
  for (const interaction of interactions) {
    applyInteraction(world, interaction)
  }
}
