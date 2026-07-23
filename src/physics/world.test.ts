import { test, expect } from 'bun:test'
import { createWorld, createBody, removeBody, reap, createConnection } from './world.js'

test('createBody assigns sequential IDs matching array index', () => {
  const world = createWorld({ gravity: { x: 0, y: 0 } })
  const a = createBody(world, 'A', '16px sans-serif')
  const b = createBody(world, 'B', '16px sans-serif')
  const c = createBody(world, 'C', '16px sans-serif')

  expect(a.id).toBe(0)
  expect(b.id).toBe(1)
  expect(c.id).toBe(2)
  expect(world.bodies[0]).toBe(a)
  expect(world.bodies[1]).toBe(b)
  expect(world.bodies[2]).toBe(c)
})

test('removeBody sets dead = true, does not splice', () => {
  const world = createWorld({ gravity: { x: 0, y: 0 } })
  createBody(world, 'A', '16px sans-serif')
  const b = createBody(world, 'B', '16px sans-serif')
  createBody(world, 'C', '16px sans-serif')

  removeBody(world, b.id)

  expect(world.bodies.length).toBe(3)
  expect(b.dead).toBe(true)
  expect(world.bodies[1]).toBe(b)
})

test('reap breaks connections to dead bodies', () => {
  const world = createWorld({ gravity: { x: 0, y: 0 } })
  const a = createBody(world, 'A', '16px sans-serif')
  const b = createBody(world, 'B', '16px sans-serif')
  const conn = createConnection(world, { type: 'rigid', a: a.id, b: b.id, length: 20 })

  removeBody(world, b.id)
  reap(world)

  expect(conn.broken).toBe(true)
})

test('createConnection assigns sequential IDs', () => {
  const world = createWorld({ gravity: { x: 0, y: 0 } })
  const a = createBody(world, 'A', '16px sans-serif')
  const b = createBody(world, 'B', '16px sans-serif')
  const c = createBody(world, 'C', '16px sans-serif')

  const c1 = createConnection(world, { type: 'rigid', a: a.id, b: b.id, length: 20 })
  const c2 = createConnection(world, { type: 'spring', a: b.id, b: c.id, stiffness: 100, damping: 5, restLength: 15 })

  expect(c1.id).toBe(0)
  expect(c2.id).toBe(1)
})
