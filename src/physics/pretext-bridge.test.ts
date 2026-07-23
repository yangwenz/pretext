import { test, expect } from 'bun:test'
import { createTextFormation, updateRestPositions } from './pretext-bridge.js'
import { createWorld } from './world.js'

const hasCanvas = typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined'
const it = hasCanvas ? test : test.skip

it('known text produces expected body count (one per grapheme)', () => {
  const world = createWorld({ gravity: { x: 0, y: 980 } })
  const formation = createTextFormation(world, 'Hello', '16px sans-serif', 400, 24)
  expect(formation.bodyIds.length).toBe(5)
  expect(world.bodies.length).toBe(5)
})

it('body positions have increasing x within a line', () => {
  const world = createWorld({ gravity: { x: 0, y: 980 } })
  const formation = createTextFormation(world, 'ABC', '16px sans-serif', 400, 24)

  const bodyA = world.bodies[formation.bodyIds[0]!]!
  const bodyB = world.bodies[formation.bodyIds[1]!]!
  const bodyC = world.bodies[formation.bodyIds[2]!]!

  expect(bodyA.position.x).toBeLessThan(bodyB.position.x)
  expect(bodyB.position.x).toBeLessThan(bodyC.position.x)
})

it('adjacent bodies on the same line are connected', () => {
  const world = createWorld({ gravity: { x: 0, y: 980 } })
  createTextFormation(world, 'Hi', '16px sans-serif', 400, 24)

  // Two chars = one connection between them
  expect(world.connections.length).toBe(1)
  expect(world.connections[0]!.a).toBe(0)
  expect(world.connections[0]!.b).toBe(1)
})

it('updateRestPositions changes body positions when width changes', () => {
  const world = createWorld({ gravity: { x: 0, y: 980 } })
  const formation = createTextFormation(world, 'Hello World', '16px sans-serif', 400, 24)

  const bodyBefore = world.bodies[formation.bodyIds[0]!]!
  const xBefore = bodyBefore.position.x

  // Re-layout with same width should give same position
  updateRestPositions(world, formation, 400)
  expect(bodyBefore.position.x).toBeCloseTo(xBefore, 3)
})

it('emoji text produces correct body count', () => {
  const world = createWorld({ gravity: { x: 0, y: 980 } })
  const formation = createTextFormation(world, 'A😀B', '16px sans-serif', 400, 24)
  // 3 graphemes: A, 😀, B
  expect(formation.bodyIds.length).toBe(3)
})
