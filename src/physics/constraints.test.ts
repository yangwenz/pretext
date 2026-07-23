import { test, expect } from 'bun:test'
import { solveRigid, solveSpring, solveRope, solveWeld, solveConstraint } from './constraints.js'
import type { Body, RigidConnection, SpringConnection, RopeConnection, WeldConnection } from './types.js'

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

test('rigid: two bodies converge to target length', () => {
  const a = makeBody({ id: 0, position: { x: 0, y: 0 } })
  const b = makeBody({ id: 1, position: { x: 30, y: 0 } })
  const bodies = [a, b]
  const conn: RigidConnection = { id: 0, type: 'rigid', a: 0, b: 1, length: 20, broken: false }

  for (let i = 0; i < 10; i++) solveRigid(conn, bodies)

  const dx = b.position.x - a.position.x
  const dy = b.position.y - a.position.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  expect(dist).toBeCloseTo(20, 2)
})

test('rigid: one static + one dynamic — only dynamic body moves', () => {
  const a = makeBody({ id: 0, position: { x: 0, y: 0 }, mass: Infinity })
  const b = makeBody({ id: 1, position: { x: 30, y: 0 } })
  const bodies = [a, b]
  const conn: RigidConnection = { id: 0, type: 'rigid', a: 0, b: 1, length: 20, broken: false }

  solveRigid(conn, bodies)

  expect(a.position.x).toBe(0)
  expect(a.position.y).toBe(0)
  expect(b.position.x).toBeCloseTo(20, 3)
})

test('spring: displaced bodies oscillate around restLength', () => {
  const a = makeBody({ id: 0, position: { x: 0, y: 0 } })
  const b = makeBody({ id: 1, position: { x: 30, y: 0 } })
  const bodies = [a, b]
  const conn: SpringConnection = { id: 0, type: 'spring', a: 0, b: 1, stiffness: 100, damping: 5, restLength: 20, broken: false }

  solveSpring(conn, bodies)

  // Force should pull bodies closer (displacement = 10 > 0 so force pulls a toward b)
  expect(a.force.x).toBeGreaterThan(0)
  expect(b.force.x).toBeLessThan(0)
})

test('spring: force magnitude matches stiffness * displacement', () => {
  const a = makeBody({ id: 0, position: { x: 0, y: 0 } })
  const b = makeBody({ id: 1, position: { x: 25, y: 0 } })
  const bodies = [a, b]
  const conn: SpringConnection = { id: 0, type: 'spring', a: 0, b: 1, stiffness: 200, damping: 0, restLength: 20, broken: false }

  const stress = solveSpring(conn, bodies)
  // displacement = 5, stress = stiffness * |displacement| = 200 * 5 = 1000
  expect(stress).toBeCloseTo(1000, 1)
})

test('rope: no effect when distance < maxLength', () => {
  const a = makeBody({ id: 0, position: { x: 0, y: 0 } })
  const b = makeBody({ id: 1, position: { x: 10, y: 0 } })
  const bodies = [a, b]
  const conn: RopeConnection = { id: 0, type: 'rope', a: 0, b: 1, maxLength: 20, broken: false }

  const stress = solveRope(conn, bodies)
  expect(stress).toBe(0)
  expect(a.position.x).toBe(0)
  expect(b.position.x).toBe(10)
})

test('rope: corrects when taut', () => {
  const a = makeBody({ id: 0, position: { x: 0, y: 0 } })
  const b = makeBody({ id: 1, position: { x: 30, y: 0 } })
  const bodies = [a, b]
  const conn: RopeConnection = { id: 0, type: 'rope', a: 0, b: 1, maxLength: 20, broken: false }

  solveRope(conn, bodies)

  const dx = b.position.x - a.position.x
  expect(dx).toBeCloseTo(20, 2)
})

test('weld: maintains both distance and relative angle', () => {
  const a = makeBody({ id: 0, position: { x: 0, y: 0 }, angle: 0 })
  const b = makeBody({ id: 1, position: { x: 5, y: 0 }, angle: 0.5 })
  const bodies = [a, b]
  const conn: WeldConnection = { id: 0, type: 'weld', a: 0, b: 1, referenceAngle: 0, broken: false }

  for (let i = 0; i < 20; i++) solveWeld(conn, bodies)

  // Angle difference should converge toward referenceAngle (0)
  expect(Math.abs(b.angle - a.angle)).toBeLessThan(0.1)
})

test('breakForce: connection snaps when stress exceeds threshold', () => {
  const a = makeBody({ id: 0, position: { x: 0, y: 0 } })
  const b = makeBody({ id: 1, position: { x: 100, y: 0 } })
  const bodies = [a, b]
  const conn: RigidConnection = { id: 0, type: 'rigid', a: 0, b: 1, length: 10, breakForce: 50, broken: false }

  solveConstraint(conn, bodies)
  expect(conn.broken).toBe(true)
})

test('breakForce: onBreak callback fires exactly once', () => {
  let callCount = 0
  const a = makeBody({ id: 0, position: { x: 0, y: 0 } })
  const b = makeBody({ id: 1, position: { x: 100, y: 0 } })
  const bodies = [a, b]
  const conn: RigidConnection = { id: 0, type: 'rigid', a: 0, b: 1, length: 10, breakForce: 50, broken: false, onBreak: () => { callCount++ } }

  solveConstraint(conn, bodies)
  solveConstraint(conn, bodies)
  expect(callCount).toBe(1)
})

test('broken connection is skipped', () => {
  const a = makeBody({ id: 0, position: { x: 0, y: 0 } })
  const b = makeBody({ id: 1, position: { x: 100, y: 0 } })
  const bodies = [a, b]
  const conn: RigidConnection = { id: 0, type: 'rigid', a: 0, b: 1, length: 10, broken: true }

  solveConstraint(conn, bodies)
  // Positions unchanged since constraint is broken
  expect(a.position.x).toBe(0)
  expect(b.position.x).toBe(100)
})
