import type {
  Body,
  Connection,
  HingeConnection,
  RigidConnection,
  RopeConnection,
  SliderConnection,
  SpringConnection,
  WeldConnection,
} from './types.js'

function getBody(bodies: Body[], id: number): Body | null {
  const b = bodies[id]
  if (!b || b.dead) return null
  return b
}

export function solveConstraint(conn: Connection, bodies: Body[]): void {
  if (conn.broken) return
  const a = getBody(bodies, conn.a)
  const b = getBody(bodies, conn.b)
  if (!a || !b) return

  // Measure stress before applying corrections; break early if threshold exceeded
  if (conn.breakForce !== undefined) {
    const stress = measureStress(conn, a, b)
    if (stress > conn.breakForce) {
      conn.broken = true
      conn.onBreak?.()
      return
    }
  }

  switch (conn.type) {
    case 'rigid': solveRigid(conn, bodies); break
    case 'spring': solveSpring(conn, bodies); break
    case 'rope': solveRope(conn, bodies); break
    case 'hinge': solveHinge(conn, bodies); break
    case 'weld': solveWeld(conn, bodies); break
    case 'slider': solveSlider(conn, bodies); break
  }
}

function measureStress(conn: Connection, a: Body, b: Body): number {
  const dx = b.position.x - a.position.x
  const dy = b.position.y - a.position.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  switch (conn.type) {
    case 'rigid': return Math.abs(dist - conn.length)
    case 'spring': return conn.stiffness * Math.abs(dist - conn.restLength)
    case 'rope': return dist > conn.maxLength ? dist - conn.maxLength : 0
    case 'weld': return dist + Math.abs((b.angle - a.angle) - conn.referenceAngle)
    case 'hinge': return Math.abs(dist)
    case 'slider': return 0
  }
}

export function solveRigid(conn: RigidConnection, bodies: Body[]): number {
  const a = getBody(bodies, conn.a)
  const b = getBody(bodies, conn.b)
  if (!a || !b) return 0

  const dx = b.position.x - a.position.x
  const dy = b.position.y - a.position.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < 0.001) return 0

  const invMassA = a.mass === Infinity ? 0 : 1 / a.mass
  const invMassB = b.mass === Infinity ? 0 : 1 / b.mass
  const invMassSum = invMassA + invMassB
  if (invMassSum === 0) return 0

  const error = dist - conn.length
  const correction = error / dist
  const corrA = correction * (invMassA / invMassSum)
  const corrB = correction * (invMassB / invMassSum)

  a.position.x += dx * corrA
  a.position.y += dy * corrA
  b.position.x -= dx * corrB
  b.position.y -= dy * corrB

  // Project velocities: remove the component along the constraint axis
  const nx = dx / dist
  const ny = dy / dist
  const dvx = b.velocity.x - a.velocity.x
  const dvy = b.velocity.y - a.velocity.y
  const relVelAlongAxis = dvx * nx + dvy * ny

  if (invMassA > 0) {
    a.velocity.x += nx * relVelAlongAxis * (invMassA / invMassSum)
    a.velocity.y += ny * relVelAlongAxis * (invMassA / invMassSum)
  }
  if (invMassB > 0) {
    b.velocity.x -= nx * relVelAlongAxis * (invMassB / invMassSum)
    b.velocity.y -= ny * relVelAlongAxis * (invMassB / invMassSum)
  }

  return Math.abs(error)
}

export function solveSpring(conn: SpringConnection, bodies: Body[]): number {
  const a = getBody(bodies, conn.a)
  const b = getBody(bodies, conn.b)
  if (!a || !b) return 0

  const dx = b.position.x - a.position.x
  const dy = b.position.y - a.position.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < 0.001) return 0

  const nx = dx / dist
  const ny = dy / dist
  const displacement = dist - conn.restLength
  const springForce = conn.stiffness * displacement

  const dvx = b.velocity.x - a.velocity.x
  const dvy = b.velocity.y - a.velocity.y
  const relVelAlongAxis = dvx * nx + dvy * ny
  const dampingForce = conn.damping * relVelAlongAxis

  const totalForce = springForce + dampingForce

  if (a.mass !== Infinity) {
    a.force.x += nx * totalForce
    a.force.y += ny * totalForce
  }
  if (b.mass !== Infinity) {
    b.force.x -= nx * totalForce
    b.force.y -= ny * totalForce
  }

  return Math.abs(conn.stiffness * displacement)
}

export function solveRope(conn: RopeConnection, bodies: Body[]): number {
  const a = getBody(bodies, conn.a)
  const b = getBody(bodies, conn.b)
  if (!a || !b) return 0

  const dx = b.position.x - a.position.x
  const dy = b.position.y - a.position.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist <= conn.maxLength) return 0

  const invMassA = a.mass === Infinity ? 0 : 1 / a.mass
  const invMassB = b.mass === Infinity ? 0 : 1 / b.mass
  const invMassSum = invMassA + invMassB
  if (invMassSum === 0) return 0

  const error = dist - conn.maxLength
  const correction = error / dist
  const corrA = correction * (invMassA / invMassSum)
  const corrB = correction * (invMassB / invMassSum)

  a.position.x += dx * corrA
  a.position.y += dy * corrA
  b.position.x -= dx * corrB
  b.position.y -= dy * corrB

  return error
}

export function solveHinge(conn: HingeConnection, bodies: Body[]): number {
  const a = getBody(bodies, conn.a)
  const b = getBody(bodies, conn.b)
  if (!a || !b) return 0

  const dx = b.position.x - conn.anchor.x
  const dy = b.position.y - conn.anchor.y
  const targetDx = a.position.x - conn.anchor.x
  const targetDy = a.position.y - conn.anchor.y

  const distB = Math.sqrt(dx * dx + dy * dy)
  const distA = Math.sqrt(targetDx * targetDx + targetDy * targetDy)
  if (distA < 0.001) return 0

  if (a.mass !== Infinity) {
    a.position.x = conn.anchor.x
    a.position.y = conn.anchor.y
    a.velocity.x = 0
    a.velocity.y = 0
  }

  if (conn.motorSpeed !== undefined && b.mass !== Infinity) {
    b.angularVelocity = conn.motorSpeed
  }

  return distB > 0 ? Math.abs(distB - distA) : 0
}

export function solveWeld(conn: WeldConnection, bodies: Body[]): number {
  const a = getBody(bodies, conn.a)
  const b = getBody(bodies, conn.b)
  if (!a || !b) return 0

  const dx = b.position.x - a.position.x
  const dy = b.position.y - a.position.y
  const dist = Math.sqrt(dx * dx + dy * dy)

  const invMassA = a.mass === Infinity ? 0 : 1 / a.mass
  const invMassB = b.mass === Infinity ? 0 : 1 / b.mass
  const invMassSum = invMassA + invMassB

  let stress = 0

  if (dist > 0.001 && invMassSum > 0) {
    stress = dist
    const corrA = (invMassA / invMassSum)
    const corrB = (invMassB / invMassSum)
    a.position.x += dx * corrA * 0.5
    a.position.y += dy * corrA * 0.5
    b.position.x -= dx * corrB * 0.5
    b.position.y -= dy * corrB * 0.5
  }

  const angleDiff = (b.angle - a.angle) - conn.referenceAngle
  stress += Math.abs(angleDiff)

  if (b.mass !== Infinity) {
    b.angle -= angleDiff * (invMassB / (invMassSum || 1))
    b.angularVelocity *= 0.9
  }
  if (a.mass !== Infinity) {
    a.angle += angleDiff * (invMassA / (invMassSum || 1))
    a.angularVelocity *= 0.9
  }

  return stress
}

export function solveSlider(conn: SliderConnection, bodies: Body[]): number {
  const a = getBody(bodies, conn.a)
  const b = getBody(bodies, conn.b)
  if (!a || !b) return 0

  const invMassA = a.mass === Infinity ? 0 : 1 / a.mass
  const invMassB = b.mass === Infinity ? 0 : 1 / b.mass
  const invMassSum = invMassA + invMassB
  if (invMassSum === 0) return 0

  const dx = b.position.x - a.position.x
  const dy = b.position.y - a.position.y

  const axisLen = Math.sqrt(conn.axis.x * conn.axis.x + conn.axis.y * conn.axis.y)
  if (axisLen < 0.001) return 0
  const axisNx = conn.axis.x / axisLen
  const axisNy = conn.axis.y / axisLen

  const projAlongAxis = dx * axisNx + dy * axisNy
  const perpX = dx - axisNx * projAlongAxis
  const perpY = dy - axisNy * projAlongAxis
  const perpDist = Math.sqrt(perpX * perpX + perpY * perpY)

  if (perpDist > 0.001) {
    const corrA = invMassA / invMassSum
    const corrB = invMassB / invMassSum
    a.position.x += perpX * corrA
    a.position.y += perpY * corrA
    b.position.x -= perpX * corrB
    b.position.y -= perpY * corrB
  }

  let stress = perpDist
  if (conn.limits) {
    const [minDist, maxDist] = conn.limits
    if (projAlongAxis < minDist) {
      const error = minDist - projAlongAxis
      const corrA = invMassA / invMassSum
      const corrB = invMassB / invMassSum
      a.position.x -= axisNx * error * corrA
      a.position.y -= axisNy * error * corrA
      b.position.x += axisNx * error * corrB
      b.position.y += axisNy * error * corrB
      stress += error
    } else if (projAlongAxis > maxDist) {
      const error = projAlongAxis - maxDist
      const corrA = invMassA / invMassSum
      const corrB = invMassB / invMassSum
      a.position.x += axisNx * error * corrA
      a.position.y += axisNy * error * corrA
      b.position.x -= axisNx * error * corrB
      b.position.y -= axisNy * error * corrB
      stress += error
    }
  }

  return stress
}
