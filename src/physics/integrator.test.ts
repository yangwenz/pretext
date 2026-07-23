import { test, expect } from 'bun:test'
import { integrate } from './integrator.js'
import type { Body, Vec2 } from './types.js'

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

const noGravity: Vec2 = { x: 0, y: 0 }
const gravity: Vec2 = { x: 0, y: 980 }
const dt = 1 / 60

test('body at rest with no forces stays at rest', () => {
  const body = makeBody()
  integrate(body, noGravity, 1, dt)
  expect(body.position.x).toBeCloseTo(0, 5)
  expect(body.position.y).toBeCloseTo(0, 5)
  expect(body.velocity.x).toBeCloseTo(0, 5)
  expect(body.velocity.y).toBeCloseTo(0, 5)
})

test('gravity accelerates a body downward', () => {
  const body = makeBody()
  integrate(body, gravity, 1, dt)
  expect(body.velocity.y).toBeGreaterThan(0)
  expect(body.position.y).toBeGreaterThan(0)
  // After one frame: vy = 0 + 980 * dt = ~16.33
  expect(body.velocity.y).toBeCloseTo(980 * dt, 1)
})

test('static bodies are unaffected by forces and gravity', () => {
  const body = makeBody({ mass: Infinity, force: { x: 100, y: 100 } })
  integrate(body, gravity, 1, dt)
  expect(body.position.x).toBe(0)
  expect(body.position.y).toBe(0)
  expect(body.velocity.x).toBe(0)
  expect(body.velocity.y).toBe(0)
})

test('torque produces angular acceleration proportional to 1/inertia', () => {
  const body = makeBody({ torque: 100, width: 10, height: 10 })
  // inertia = mass * (w^2 + h^2) / 12 = 1 * (100 + 100) / 12 = 16.67
  const inertia = 1 * (10 * 10 + 10 * 10) / 12
  integrate(body, noGravity, 1, dt)
  expect(body.angularVelocity).toBeCloseTo(100 / inertia * dt, 3)
})

test('force and torque are zeroed after integration', () => {
  const body = makeBody({ force: { x: 50, y: -30 }, torque: 10 })
  integrate(body, noGravity, 1, dt)
  expect(body.force.x).toBe(0)
  expect(body.force.y).toBe(0)
  expect(body.torque).toBe(0)
})

test('damping reduces velocity', () => {
  const body = makeBody({ velocity: { x: 100, y: 0 } })
  integrate(body, noGravity, 0.95, dt)
  expect(body.velocity.x).toBeCloseTo(100 * 0.95, 3)
})

test('dead bodies are not integrated', () => {
  const body = makeBody({ dead: true, force: { x: 100, y: 0 } })
  integrate(body, gravity, 1, dt)
  expect(body.position.x).toBe(0)
  expect(body.position.y).toBe(0)
})

test('sleeping bodies are not integrated', () => {
  const body = makeBody({ sleeping: true, force: { x: 100, y: 0 } })
  integrate(body, gravity, 1, dt)
  expect(body.position.x).toBe(0)
  expect(body.position.y).toBe(0)
})
