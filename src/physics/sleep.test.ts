import { test, expect } from 'bun:test'
import { checkSleep, wake } from './sleep.js'
import { createWorld, createBody, createConnection } from './world.js'
import type { Body } from './types.js'

const sleepConfig = { sleepThresholdVel: 0.5, sleepThresholdAng: 0.01, sleepDelay: 60 }

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

test('body falls asleep after sleepDelay frames below threshold', () => {
  const body = makeBody({ velocity: { x: 0.1, y: 0.1 } })
  for (let i = 0; i < 60; i++) {
    checkSleep(body, sleepConfig)
  }
  expect(body.sleeping).toBe(true)
})

test('any velocity above threshold resets the timer', () => {
  const body = makeBody({ velocity: { x: 0.1, y: 0.1 } })
  for (let i = 0; i < 50; i++) checkSleep(body, sleepConfig)
  expect(body.sleeping).toBe(false)
  expect(body.sleepTimer).toBe(50)

  // Move fast for one frame
  body.velocity.x = 10
  checkSleep(body, sleepConfig)
  expect(body.sleepTimer).toBe(0)
  expect(body.sleeping).toBe(false)
})

test('wake propagates through connected bodies', () => {
  const world = createWorld({ gravity: { x: 0, y: 0 } })
  const a = createBody(world, 'A', '16px sans-serif', { sleeping: true, sleepTimer: 60 })
  const b = createBody(world, 'B', '16px sans-serif', { sleeping: true, sleepTimer: 60 })
  const c = createBody(world, 'C', '16px sans-serif', { sleeping: true, sleepTimer: 60 })

  createConnection(world, { type: 'rigid', a: a.id, b: b.id, length: 20 })
  createConnection(world, { type: 'rigid', a: b.id, b: c.id, length: 20 })

  wake(a, world)

  expect(a.sleeping).toBe(false)
  expect(b.sleeping).toBe(false)
  expect(c.sleeping).toBe(false)
})

test('wake does not infinite-loop on cyclic connections', () => {
  const world = createWorld({ gravity: { x: 0, y: 0 } })
  const a = createBody(world, 'A', '16px sans-serif', { sleeping: true, sleepTimer: 60 })
  const b = createBody(world, 'B', '16px sans-serif', { sleeping: true, sleepTimer: 60 })
  const c = createBody(world, 'C', '16px sans-serif', { sleeping: true, sleepTimer: 60 })

  createConnection(world, { type: 'rigid', a: a.id, b: b.id, length: 20 })
  createConnection(world, { type: 'rigid', a: b.id, b: c.id, length: 20 })
  createConnection(world, { type: 'rigid', a: c.id, b: a.id, length: 20 })

  // Should not hang
  wake(a, world)

  expect(a.sleeping).toBe(false)
  expect(b.sleeping).toBe(false)
  expect(c.sleeping).toBe(false)
})
