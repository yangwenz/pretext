import type { Body, Connection, World, WorldConfig } from './types.js'

export function createWorld(config: WorldConfig): World {
  return {
    bodies: [],
    connections: [],
    config: {
      gravity: config.gravity,
      bounds: config.bounds ?? { x: 0, y: 0, width: 800, height: 600 },
      iterations: config.iterations ?? 4,
      damping: config.damping ?? 0.99,
      sleepThresholdVel: config.sleepThresholdVel ?? 0.5,
      sleepThresholdAng: config.sleepThresholdAng ?? 0.01,
      sleepDelay: config.sleepDelay ?? 60,
    },
    nextBodyId: 0,
    nextConnectionId: 0,
  }
}

export function createBody(world: World, char: string, font: string, opts?: Partial<Body>): Body {
  const body: Body = {
    id: world.nextBodyId,
    char,
    font,
    z: opts?.z ?? 0,
    mass: opts?.mass ?? 1,
    restitution: opts?.restitution ?? 0.3,
    friction: opts?.friction ?? 0.2,
    width: opts?.width ?? 16,
    height: opts?.height ?? 16,
    position: opts?.position ?? { x: 0, y: 0 },
    velocity: opts?.velocity ?? { x: 0, y: 0 },
    angle: opts?.angle ?? 0,
    angularVelocity: opts?.angularVelocity ?? 0,
    force: opts?.force ?? { x: 0, y: 0 },
    torque: opts?.torque ?? 0,
    collisionGroup: opts?.collisionGroup ?? 0,
    collisionMask: opts?.collisionMask ?? 0xFFFFFFFF,
    sleeping: opts?.sleeping ?? false,
    sleepTimer: opts?.sleepTimer ?? 0,
    dead: opts?.dead ?? false,
  }
  world.bodies.push(body)
  world.nextBodyId++
  return body
}

type ConnectionInput = {
  [K in Connection['type']]: Omit<Extract<Connection, { type: K }>, 'id' | 'broken'>
}[Connection['type']]

export function createConnection(world: World, conn: ConnectionInput): Connection {
  const connection = { ...conn, id: world.nextConnectionId, broken: false } as Connection
  world.connections.push(connection)
  world.nextConnectionId++
  return connection
}

export function removeBody(world: World, bodyId: number): void {
  const body = world.bodies[bodyId]
  if (body) body.dead = true
}

export function removeConnection(world: World, connId: number): void {
  for (const conn of world.connections) {
    if (conn.id === connId) {
      conn.broken = true
      return
    }
  }
}

export function reap(world: World): void {
  for (const conn of world.connections) {
    if (conn.broken) continue
    const a = world.bodies[conn.a]
    const b = world.bodies[conn.b]
    if ((a && a.dead) || (b && b.dead)) {
      conn.broken = true
    }
  }
}
