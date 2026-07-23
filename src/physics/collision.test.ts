import { test, expect } from 'bun:test'
import { createSpatialHash, updateSpatialHash, detectAndResolve } from './collision.js'
import type { Body } from './types.js'

function makeBody(overrides?: Partial<Body>): Body {
  return {
    id: 0, char: 'A', font: '16px sans-serif', z: 0,
    mass: 1, restitution: 0.3, friction: 0.2, width: 16, height: 16,
    position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 },
    angle: 0, angularVelocity: 0,
    force: { x: 0, y: 0 }, torque: 0,
    collisionGroup: 0, collisionMask: 0xFFFFFFFF,
    sleeping: false, sleepTimer: 0, dead: false,
    ...overrides,
  }
}

test('two overlapping bodies are separated', () => {
  const a = makeBody({ id: 0, position: { x: 10, y: 0 }, width: 20, height: 20 })
  const b = makeBody({ id: 1, position: { x: 15, y: 0 }, width: 20, height: 20 })
  const bodies = [a, b]

  const hash = createSpatialHash(24)
  updateSpatialHash(hash, bodies)
  detectAndResolve(hash, bodies)

  const dx = Math.abs(b.position.x - a.position.x)
  // After resolution, gap should be at least the sum of half-widths (20)
  expect(dx).toBeGreaterThanOrEqual(19.9)
})

test('non-overlapping bodies are unaffected', () => {
  const a = makeBody({ id: 0, position: { x: 0, y: 0 }, width: 10, height: 10 })
  const b = makeBody({ id: 1, position: { x: 50, y: 0 }, width: 10, height: 10 })
  const bodies = [a, b]

  const hash = createSpatialHash(24)
  updateSpatialHash(hash, bodies)
  detectAndResolve(hash, bodies)

  expect(a.position.x).toBe(0)
  expect(b.position.x).toBe(50)
})

test('same collisionGroup bodies do not collide', () => {
  const a = makeBody({ id: 0, position: { x: 10, y: 0 }, width: 20, height: 20, collisionGroup: 1 })
  const b = makeBody({ id: 1, position: { x: 15, y: 0 }, width: 20, height: 20, collisionGroup: 1 })
  const bodies = [a, b]

  const hash = createSpatialHash(24)
  updateSpatialHash(hash, bodies)
  detectAndResolve(hash, bodies)

  // Positions unchanged since same group
  expect(a.position.x).toBe(10)
  expect(b.position.x).toBe(15)
})

test('dead bodies are excluded from collision', () => {
  const a = makeBody({ id: 0, position: { x: 10, y: 0 }, width: 20, height: 20 })
  const b = makeBody({ id: 1, position: { x: 15, y: 0 }, width: 20, height: 20, dead: true })
  const bodies = [a, b]

  const hash = createSpatialHash(24)
  updateSpatialHash(hash, bodies)
  detectAndResolve(hash, bodies)

  expect(a.position.x).toBe(10)
})

test('spatial hash correctly bins bodies', () => {
  const bodies = [
    makeBody({ id: 0, position: { x: 5, y: 5 }, width: 4, height: 4 }),
    makeBody({ id: 1, position: { x: 100, y: 100 }, width: 4, height: 4 }),
  ]

  const hash = createSpatialHash(24)
  updateSpatialHash(hash, bodies)

  // Bodies in different cells should not collide
  let cellsWithMultiple = 0
  for (const cell of hash.cells.values()) {
    if (cell.length > 1) cellsWithMultiple++
  }
  expect(cellsWithMultiple).toBe(0)
})
