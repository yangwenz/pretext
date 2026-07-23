import type { Body } from './types.js'

export type SpatialHash = { cellSize: number; cells: Map<number, number[]> }

export function createSpatialHash(cellSize: number): SpatialHash {
  return { cellSize, cells: new Map() }
}

export function updateSpatialHash(hash: SpatialHash, bodies: Body[]): void {
  hash.cells.clear()
  for (const body of bodies) {
    if (body.dead || body.mass === Infinity) continue
    const minX = Math.floor((body.position.x - body.width / 2) / hash.cellSize)
    const maxX = Math.floor((body.position.x + body.width / 2) / hash.cellSize)
    const minY = Math.floor((body.position.y - body.height / 2) / hash.cellSize)
    const maxY = Math.floor((body.position.y + body.height / 2) / hash.cellSize)
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const key = cx * 73856093 ^ cy * 19349663
        let cell = hash.cells.get(key)
        if (!cell) {
          cell = []
          hash.cells.set(key, cell)
        }
        cell.push(body.id)
      }
    }
  }
}

export function detectAndResolve(hash: SpatialHash, bodies: Body[]): void {
  const checked = new Set<number>()

  for (const cell of hash.cells.values()) {
    for (let i = 0; i < cell.length; i++) {
      for (let j = i + 1; j < cell.length; j++) {
        const idA = cell[i]!
        const idB = cell[j]!
        const pairKey = idA < idB ? idA * 100000 + idB : idB * 100000 + idA
        if (checked.has(pairKey)) continue
        checked.add(pairKey)

        const a = bodies[idA]
        const b = bodies[idB]
        if (!a || !b || a.dead || b.dead) continue
        if (a.mass === Infinity && b.mass === Infinity) continue

        // Collision group filtering
        if (a.collisionGroup === b.collisionGroup && a.collisionGroup !== 0) continue
        if ((a.collisionMask & (1 << b.collisionGroup)) === 0) continue
        if ((b.collisionMask & (1 << a.collisionGroup)) === 0) continue

        resolveCollision(a, b)
      }
    }
  }
}

function resolveCollision(a: Body, b: Body): void {
  const aLeft = a.position.x - a.width / 2
  const aRight = a.position.x + a.width / 2
  const aTop = a.position.y - a.height / 2
  const aBottom = a.position.y + a.height / 2

  const bLeft = b.position.x - b.width / 2
  const bRight = b.position.x + b.width / 2
  const bTop = b.position.y - b.height / 2
  const bBottom = b.position.y + b.height / 2

  // AABB overlap check
  const overlapX = Math.min(aRight, bRight) - Math.max(aLeft, bLeft)
  const overlapY = Math.min(aBottom, bBottom) - Math.max(aTop, bTop)

  if (overlapX <= 0 || overlapY <= 0) return

  const invMassA = a.mass === Infinity ? 0 : 1 / a.mass
  const invMassB = b.mass === Infinity ? 0 : 1 / b.mass
  const invMassSum = invMassA + invMassB
  if (invMassSum === 0) return

  // Resolve along the axis of minimum penetration
  let nx: number, ny: number, penetration: number
  if (overlapX < overlapY) {
    penetration = overlapX
    nx = a.position.x < b.position.x ? -1 : 1
    ny = 0
  } else {
    penetration = overlapY
    nx = 0
    ny = a.position.y < b.position.y ? -1 : 1
  }

  // Position correction
  const corrA = penetration * (invMassA / invMassSum)
  const corrB = penetration * (invMassB / invMassSum)
  a.position.x += nx * corrA
  a.position.y += ny * corrA
  b.position.x -= nx * corrB
  b.position.y -= ny * corrB

  // Velocity reflection
  const relVelX = a.velocity.x - b.velocity.x
  const relVelY = a.velocity.y - b.velocity.y
  const relVelAlongNormal = relVelX * nx + relVelY * ny

  if (relVelAlongNormal > 0) return // separating

  const restitution = Math.min(a.restitution, b.restitution)
  const impulse = -(1 + restitution) * relVelAlongNormal / invMassSum

  a.velocity.x += nx * impulse * invMassA
  a.velocity.y += ny * impulse * invMassA
  b.velocity.x -= nx * impulse * invMassB
  b.velocity.y -= ny * impulse * invMassB
}
