import { test, expect } from 'bun:test'
import { solveBounds } from './bounds.js'
import type { Body, Rect } from './types.js'

function makeBody(overrides?: Partial<Body>): Body {
  return {
    id: 0, char: 'A', font: '16px sans-serif', z: 0,
    mass: 1, restitution: 0.5, friction: 0.3, width: 10, height: 10,
    position: { x: 50, y: 50 }, velocity: { x: 0, y: 0 },
    angle: 0, angularVelocity: 0,
    force: { x: 0, y: 0 }, torque: 0,
    collisionGroup: 0, collisionMask: 0xFFFFFFFF,
    sleeping: false, sleepTimer: 0, dead: false,
    ...overrides,
  }
}

const bounds: Rect = { x: 0, y: 0, width: 100, height: 100 }

test('body clamped inside bounds on left', () => {
  const body = makeBody({ position: { x: -5, y: 50 }, velocity: { x: -10, y: 0 } })
  solveBounds(body, bounds)
  expect(body.position.x).toBe(5) // hw = 5
  expect(body.velocity.x).toBeGreaterThan(0) // reflected
})

test('body clamped inside bounds on right', () => {
  const body = makeBody({ position: { x: 105, y: 50 }, velocity: { x: 10, y: 0 } })
  solveBounds(body, bounds)
  expect(body.position.x).toBe(95) // bounds.width - hw
  expect(body.velocity.x).toBeLessThan(0)
})

test('body clamped inside bounds on top', () => {
  const body = makeBody({ position: { x: 50, y: -5 }, velocity: { x: 0, y: -10 } })
  solveBounds(body, bounds)
  expect(body.position.y).toBe(5)
  expect(body.velocity.y).toBeGreaterThan(0)
})

test('body clamped inside bounds on floor', () => {
  const body = makeBody({ position: { x: 50, y: 105 }, velocity: { x: 0, y: 10 } })
  solveBounds(body, bounds)
  expect(body.position.y).toBe(95) // bounds.height - hh
  expect(body.velocity.y).toBeLessThan(0)
})

test('velocity reflected with correct restitution', () => {
  const body = makeBody({ position: { x: -5, y: 50 }, velocity: { x: -20, y: 0 }, restitution: 0.8 })
  solveBounds(body, bounds)
  expect(body.velocity.x).toBeCloseTo(20 * 0.8, 3)
})

test('floor friction reduces horizontal velocity and angular velocity', () => {
  const body = makeBody({
    position: { x: 50, y: 105 },
    velocity: { x: 100, y: 10 },
    angularVelocity: 5,
    friction: 0.4,
  })
  solveBounds(body, bounds)
  expect(body.velocity.x).toBeCloseTo(100 * (1 - 0.4), 3)
  expect(body.angularVelocity).toBeCloseTo(5 * (1 - 0.4), 3)
})
