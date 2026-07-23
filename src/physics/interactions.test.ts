import { test, expect } from 'bun:test'
import { applyInteraction } from './interactions.js'
import { createWorld, createBody } from './world.js'
import type { Interaction } from './types.js'

test('drag: force proportional to distance from target', () => {
  const world = createWorld({ gravity: { x: 0, y: 0 } })
  const body = createBody(world, 'A', '16px sans-serif', { position: { x: 10, y: 10 } })

  const interaction: Interaction = { type: 'drag', bodyId: body.id, target: { x: 50, y: 10 }, stiffness: 100 }
  applyInteraction(world, interaction)

  expect(body.force.x).toBeCloseTo(40 * 100, 1) // dx=40, stiffness=100
  expect(body.force.y).toBeCloseTo(0, 5)
})

test('impulse: bodies within radius receive velocity', () => {
  const world = createWorld({ gravity: { x: 0, y: 0 } })
  const near = createBody(world, 'A', '16px sans-serif', { position: { x: 10, y: 0 } })
  const far = createBody(world, 'B', '16px sans-serif', { position: { x: 200, y: 0 } })

  const interaction: Interaction = { type: 'impulse', position: { x: 0, y: 0 }, radius: 50, strength: 100 }
  applyInteraction(world, interaction)

  expect(near.velocity.x).toBeGreaterThan(0)
  expect(far.velocity.x).toBe(0)
})

test('impulse: force falloff is linear with distance', () => {
  const world = createWorld({ gravity: { x: 0, y: 0 } })
  const close = createBody(world, 'A', '16px sans-serif', { position: { x: 10, y: 0 } })
  const mid = createBody(world, 'B', '16px sans-serif', { position: { x: 25, y: 0 } })

  const interaction: Interaction = { type: 'impulse', position: { x: 0, y: 0 }, radius: 50, strength: 100 }
  applyInteraction(world, interaction)

  // Close body should receive more velocity than mid body
  expect(close.velocity.x).toBeGreaterThan(mid.velocity.x)
})

test('attractor: force direction points toward attractor position', () => {
  const world = createWorld({ gravity: { x: 0, y: 0 } })
  const body = createBody(world, 'A', '16px sans-serif', { position: { x: 50, y: 0 } })

  const interaction: Interaction = { type: 'attractor', position: { x: 0, y: 0 }, strength: 1000, falloff: 'linear' }
  applyInteraction(world, interaction)

  // Force should point toward (0,0) from (50,0), so negative x
  expect(body.force.x).toBeLessThan(0)
})

test('static bodies are unaffected by impulse', () => {
  const world = createWorld({ gravity: { x: 0, y: 0 } })
  const body = createBody(world, 'A', '16px sans-serif', { position: { x: 10, y: 0 }, mass: Infinity })

  const interaction: Interaction = { type: 'impulse', position: { x: 0, y: 0 }, radius: 50, strength: 100 }
  applyInteraction(world, interaction)

  expect(body.velocity.x).toBe(0)
  expect(body.velocity.y).toBe(0)
})

test('dead bodies are unaffected by interactions', () => {
  const world = createWorld({ gravity: { x: 0, y: 0 } })
  const body = createBody(world, 'A', '16px sans-serif', { position: { x: 10, y: 0 }, dead: true })

  const interaction: Interaction = { type: 'attractor', position: { x: 0, y: 0 }, strength: 1000, falloff: 'linear' }
  applyInteraction(world, interaction)

  expect(body.force.x).toBe(0)
  expect(body.force.y).toBe(0)
})

test('sleeping bodies are woken by interactions', () => {
  const world = createWorld({ gravity: { x: 0, y: 0 } })
  const body = createBody(world, 'A', '16px sans-serif', { position: { x: 10, y: 0 }, sleeping: true, sleepTimer: 60 })

  const interaction: Interaction = { type: 'impulse', position: { x: 0, y: 0 }, radius: 50, strength: 100 }
  applyInteraction(world, interaction)

  expect(body.sleeping).toBe(false)
})
