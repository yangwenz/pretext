import { prepareWithSegments, layoutNextLine, type LayoutCursor } from '../../src/layout.js'
import { createWorld, createBody, step } from '../../src/physics/index.js'
import type { Body } from '../../src/physics/types.js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const dpr = window.devicePixelRatio || 1

const W = Math.min(960, window.innerWidth - 48)
const H = 720
canvas.width = W * dpr
canvas.height = H * dpr
canvas.style.width = `${W}px`
canvas.style.height = `${H}px`
ctx.scale(dpr, dpr)

// --- Text setup ---
const bodyFont = '15px Georgia, "Times New Roman", serif'
const lineHeight = 22
const marginX = 28
const textStartY = 24

const documentText = `The machine is a poem written in iron and brass. Each gear meshes with the next in a conversation of torque and timing, teeth meeting teeth in precise choreography. The pendulum marks time like a metronome for industry — its arc is the heartbeat of mechanism, steady and indifferent to the chaos it governs. Below, the conveyor carries its burden forward with the patience of a river, each roller turning in silent agreement with its neighbors. The ball enters at the top, innocent of the journey ahead. It will fall through ramps and be caught by spinning wheels, launched across gaps and guided by rails that curve like musical notation. Every collision is a note, every bounce a beat in the symphony of motion. The beauty of a Rube Goldberg machine is that it makes the simple complex — a ball must travel through a hundred mechanisms to accomplish what gravity alone could do in a straight line. But the journey is the point. The machine exists not for efficiency but for wonder, not for productivity but for delight. Each component is a small miracle of engineering: the gear that translates rotation into linear motion, the lever that amplifies force, the spring that stores energy for release at the perfect moment. Together they form a cascade of cause and effect, a physical proof that complexity can emerge from simple rules applied with precision and imagination. The earliest machines were simple: a wedge to split wood, a lever to lift stone, an inclined plane to raise what muscle alone could not. But even these humble tools contained the seed of every mechanism that followed. The wheel was the first revolution — a circle that translated effort into distance, that made the impossible merely difficult. From the wheel came the axle, from the axle came the gear, and from the gear came the clock, the mill, the engine, the factory. Each invention stood on the shoulders of the last, a tower of ingenuity rising through centuries. The craftsmen who built the great cathedral clocks understood something profound: that time itself could be captured in brass and iron, divided into equal portions by the steady swing of a pendulum. Their machines did not merely measure time — they created it, giving civilization a shared rhythm by which to organize labor, commerce, and prayer. Today we build machines of silicon and light, but the principles remain unchanged. Energy is still conserved, momentum still transfers, friction still opposes motion. The digital world is built atop the physical one, and every algorithm is ultimately executed by electrons flowing through circuits that obey the same laws Newton wrote three centuries ago.`

const prepared = prepareWithSegments(documentText, bodyFont)
const internalWidths: number[] = (prepared as any).widths
const segments: string[] = prepared.segments

// --- Physics world ---
const world = createWorld({
  gravity: { x: 0, y: 500 },
  bounds: { x: 0, y: 0, width: W, height: H + 200 },
  iterations: 8,
  damping: 0.998,
  sleepThresholdVel: 0.3,
  sleepDelay: 120,
})

// --- Gears ---
type Gear = {
  x: number
  y: number
  radius: number
  teeth: number
  angle: number
  speed: number
  color: string
}

const gears: Gear[] = [
  { x: W * 0.18, y: H * 0.22, radius: 55, teeth: 16, angle: 0, speed: 0.8, color: '#c87533' },
  { x: W * 0.18 + 82, y: H * 0.22 + 38, radius: 35, teeth: 10, angle: Math.PI / 10, speed: -1.26, color: '#d4944a' },
  { x: W * 0.75, y: H * 0.45, radius: 48, teeth: 14, angle: 0, speed: -0.6, color: '#a0652e' },
  { x: W * 0.75 + 70, y: H * 0.45 - 10, radius: 30, teeth: 9, angle: Math.PI / 9, speed: 0.96, color: '#c87533' },
]

// --- Pendulum ---
type Pendulum = {
  pivotX: number
  pivotY: number
  length: number
  angle: number
  angularVel: number
  bobRadius: number
}

const pendulum: Pendulum = {
  pivotX: W * 0.5,
  pivotY: H * 0.05,
  length: 120,
  angle: Math.PI / 6,
  angularVel: 0,
  bobRadius: 14,
}

// --- Conveyor belt ---
type Conveyor = {
  x: number
  y: number
  width: number
  height: number
  speed: number
  rollerRadius: number
  rollerSpacing: number
  phase: number
}

const conveyor: Conveyor = {
  x: W * 0.25,
  y: H * 0.68,
  width: W * 0.5,
  height: 20,
  speed: 60,
  rollerRadius: 8,
  rollerSpacing: 32,
  phase: 0,
}

// --- Ramps ---
type Ramp = { x1: number; y1: number; x2: number; y2: number }

const ramps: Ramp[] = [
  { x1: W * 0.35, y1: H * 0.28, x2: W * 0.60, y2: H * 0.34 },
  { x1: W * 0.68, y1: H * 0.40, x2: W * 0.45, y2: H * 0.48 },
  { x1: W * 0.30, y1: H * 0.54, x2: W * 0.18, y2: H * 0.60 },
  { x1: W * 0.82, y1: H * 0.62, x2: W * 0.75, y2: H * 0.67 },
]

// --- Ball ---
type Ball = {
  body: Body
  radius: number
  trail: { x: number; y: number; age: number }[]
  active: boolean
}

const BALL_RADIUS = 9
let ball: Ball = createBallState()

function createBallState(): Ball {
  const body = createBody(world, '●', bodyFont, {
    position: { x: W * 0.5, y: -20 },
    mass: 2,
    width: BALL_RADIUS * 2,
    height: BALL_RADIUS * 2,
    restitution: 0.6,
    friction: 0.15,
    collisionGroup: 0,
  })
  return { body, radius: BALL_RADIUS, trail: [], active: false }
}

function launchBall() {
  ball.body.position.x = W * 0.38 + Math.random() * 30
  ball.body.position.y = H * 0.05
  ball.body.velocity.x = (Math.random() - 0.5) * 40
  ball.body.velocity.y = 50
  ball.body.sleeping = false
  ball.body.sleepTimer = 0
  ball.active = true
  ball.trail = []
}

canvas.addEventListener('click', launchBall)

// --- Spark particles ---
type Spark = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number }
const sparks: Spark[] = []

function emitSparks(x: number, y: number, count: number, color: string, speed: number) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const spd = speed * (0.3 + Math.random() * 0.7)
    sparks.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd - 30,
      life: 0,
      maxLife: 0.4 + Math.random() * 0.5,
      color,
      size: 1 + Math.random() * 2.5,
    })
  }
}

// --- Physics helpers ---
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): { dist: number; nx: number; ny: number; cx: number; cy: number } {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  if (len2 === 0) {
    const d = Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
    return { dist: d, nx: (px - x1) / (d || 1), ny: (py - y1) / (d || 1), cx: x1, cy: y1 }
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2))
  const cx = x1 + t * dx
  const cy = y1 + t * dy
  const distX = px - cx
  const distY = py - cy
  const dist = Math.sqrt(distX * distX + distY * distY)
  return { dist, nx: distX / (dist || 1), ny: distY / (dist || 1), cx, cy }
}

function collideBallWithRamps() {
  if (!ball.active) return
  const b = ball.body
  for (const ramp of ramps) {
    const { dist, nx, ny, cx, cy } = distToSegment(b.position.x, b.position.y, ramp.x1, ramp.y1, ramp.x2, ramp.y2)
    if (dist < ball.radius + 4) {
      const overlap = ball.radius + 4 - dist
      b.position.x += nx * overlap
      b.position.y += ny * overlap
      const relVn = b.velocity.x * nx + b.velocity.y * ny
      if (relVn < 0) {
        b.velocity.x -= 1.6 * relVn * nx
        b.velocity.y -= 1.6 * relVn * ny
        // Friction along ramp
        const tx = -ny
        const ty = nx
        const relVt = b.velocity.x * tx + b.velocity.y * ty
        b.velocity.x -= relVt * 0.02
        b.velocity.y -= relVt * 0.02
      }
      b.sleeping = false
      b.sleepTimer = 0
      if (Math.abs(relVn) > 50) {
        emitSparks(cx, cy, 3, '#ffaa44', 80)
      }
    }
  }
}

function collideBallWithGears() {
  if (!ball.active) return
  const b = ball.body
  for (const gear of gears) {
    const dx = b.position.x - gear.x
    const dy = b.position.y - gear.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < ball.radius + gear.radius + 4) {
      const overlap = ball.radius + gear.radius + 4 - dist
      const nx = dx / (dist || 1)
      const ny = dy / (dist || 1)
      b.position.x += nx * overlap
      b.position.y += ny * overlap
      // Gear imparts tangential velocity
      const tangentX = -ny
      const tangentY = nx
      const gearSurfaceSpeed = gear.speed * gear.radius * 0.3
      b.velocity.x += tangentX * gearSurfaceSpeed * 0.5
      b.velocity.y += tangentY * gearSurfaceSpeed * 0.5
      const relVn = b.velocity.x * nx + b.velocity.y * ny
      if (relVn < 0) {
        b.velocity.x -= 1.4 * relVn * nx
        b.velocity.y -= 1.4 * relVn * ny
      }
      b.sleeping = false
      b.sleepTimer = 0
      emitSparks(b.position.x - nx * ball.radius, b.position.y - ny * ball.radius, 5, gear.color, 120)
    }
  }
}

function collideBallWithPendulum() {
  if (!ball.active) return
  const b = ball.body
  const bobX = pendulum.pivotX + Math.sin(pendulum.angle) * pendulum.length
  const bobY = pendulum.pivotY + Math.cos(pendulum.angle) * pendulum.length
  const dx = b.position.x - bobX
  const dy = b.position.y - bobY
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < ball.radius + pendulum.bobRadius) {
    const overlap = ball.radius + pendulum.bobRadius - dist
    const nx = dx / (dist || 1)
    const ny = dy / (dist || 1)
    b.position.x += nx * overlap
    b.position.y += ny * overlap
    // Transfer pendulum momentum
    const bobVx = pendulum.angularVel * Math.cos(pendulum.angle) * pendulum.length
    const bobVy = -pendulum.angularVel * Math.sin(pendulum.angle) * pendulum.length
    b.velocity.x += nx * 200 + bobVx * 0.5
    b.velocity.y += ny * 200 + bobVy * 0.5
    pendulum.angularVel *= 0.7
    b.sleeping = false
    b.sleepTimer = 0
    emitSparks(bobX + nx * pendulum.bobRadius, bobY + ny * pendulum.bobRadius, 8, '#ffdd66', 150)
  }
}

function collideBallWithConveyor() {
  if (!ball.active) return
  const b = ball.body
  if (b.position.x > conveyor.x - 10 && b.position.x < conveyor.x + conveyor.width + 10 &&
      b.position.y + ball.radius > conveyor.y - 4 && b.position.y < conveyor.y + conveyor.height) {
    const overlap = (b.position.y + ball.radius) - (conveyor.y - 4)
    if (overlap > 0) {
      b.position.y -= overlap
      if (b.velocity.y > 0) b.velocity.y *= -0.3
      // Conveyor pushes ball horizontally
      b.velocity.x += conveyor.speed * 0.08
      b.sleeping = false
      b.sleepTimer = 0
    }
  }
}

// --- Text layout around obstacles ---
type PositionedWord = { text: string; x: number; y: number; width: number }

function layoutAroundMachine(): PositionedWord[] {
  const words: PositionedWord[] = []
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let lineTop = textStartY
  const regionLeft = marginX
  const regionRight = W - marginX

  while (lineTop + lineHeight < H - 20) {
    const bandTop = lineTop
    const bandBottom = lineTop + lineHeight
    const blocked: { left: number; right: number }[] = []

    // Gears
    for (const gear of gears) {
      const gTop = gear.y - gear.radius - 8
      const gBot = gear.y + gear.radius + 8
      if (gBot > bandTop && gTop < bandBottom) {
        blocked.push({ left: gear.x - gear.radius - 10, right: gear.x + gear.radius + 10 })
      }
    }

    // Pendulum bob
    const bobX = pendulum.pivotX + Math.sin(pendulum.angle) * pendulum.length
    const bobY = pendulum.pivotY + Math.cos(pendulum.angle) * pendulum.length
    const bobTop = bobY - pendulum.bobRadius - 6
    const bobBot = bobY + pendulum.bobRadius + 6
    if (bobBot > bandTop && bobTop < bandBottom) {
      blocked.push({ left: bobX - pendulum.bobRadius - 8, right: bobX + pendulum.bobRadius + 8 })
    }
    // Pendulum rod
    const rodMinY = Math.min(pendulum.pivotY, bobY)
    const rodMaxY = Math.max(pendulum.pivotY, bobY)
    if (rodMaxY > bandTop && rodMinY < bandBottom) {
      const bandMidY = (bandTop + bandBottom) / 2
      const t = Math.max(0, Math.min(1, (bandMidY - pendulum.pivotY) / (bobY - pendulum.pivotY || 1)))
      const rodX = pendulum.pivotX + t * (bobX - pendulum.pivotX)
      blocked.push({ left: rodX - 6, right: rodX + 6 })
    }

    // Conveyor
    if (conveyor.y + conveyor.height + 4 > bandTop && conveyor.y - 4 < bandBottom) {
      blocked.push({ left: conveyor.x - 10, right: conveyor.x + conveyor.width + 10 })
    }

    // Ramps
    for (const ramp of ramps) {
      const rMinY = Math.min(ramp.y1, ramp.y2) - 6
      const rMaxY = Math.max(ramp.y1, ramp.y2) + 6
      if (rMaxY > bandTop && rMinY < bandBottom) {
        const rMinX = Math.min(ramp.x1, ramp.x2) - 6
        const rMaxX = Math.max(ramp.x1, ramp.x2) + 6
        blocked.push({ left: rMinX, right: rMaxX })
      }
    }

    // Ball
    if (ball.active) {
      const bTop = ball.body.position.y - ball.radius - 6
      const bBot = ball.body.position.y + ball.radius + 6
      if (bBot > bandTop && bTop < bandBottom) {
        blocked.push({ left: ball.body.position.x - ball.radius - 8, right: ball.body.position.x + ball.radius + 8 })
      }
    }

    blocked.sort((a, b) => a.left - b.left)
    const merged: { left: number; right: number }[] = []
    for (const b of blocked) {
      const last = merged[merged.length - 1]
      if (last && b.left <= last.right) {
        last.right = Math.max(last.right, b.right)
      } else {
        merged.push({ left: b.left, right: b.right })
      }
    }

    const slots: { left: number; right: number }[] = []
    let slotLeft = regionLeft
    for (const b of merged) {
      if (b.left > slotLeft) slots.push({ left: slotLeft, right: b.left })
      slotLeft = Math.max(slotLeft, b.right)
    }
    if (slotLeft < regionRight) slots.push({ left: slotLeft, right: regionRight })

    if (slots.length === 0) { lineTop += lineHeight; continue }

    let done = false
    for (const slot of slots) {
      const slotWidth = slot.right - slot.left
      if (slotWidth < 30) continue
      const line = layoutNextLine(prepared, cursor, slotWidth)
      if (line === null) { done = true; break }

      let x = slot.left
      let segIdx = line.start.segmentIndex
      let gIdx = line.start.graphemeIndex

      while (segIdx < line.end.segmentIndex || (segIdx === line.end.segmentIndex && gIdx < line.end.graphemeIndex)) {
        const segText = segments[segIdx]!
        const segWidth = internalWidths[segIdx]!

        if (segIdx === line.start.segmentIndex && gIdx > 0) {
          const slice = segText.slice(gIdx)
          ctx.font = bodyFont
          const sliceWidth = ctx.measureText(slice).width
          if (slice.trim().length > 0) words.push({ text: slice, x, y: lineTop, width: sliceWidth })
          x += sliceWidth
        } else if (segIdx === line.end.segmentIndex && line.end.graphemeIndex > 0 && line.end.graphemeIndex < segText.length) {
          const slice = segText.slice(0, line.end.graphemeIndex)
          ctx.font = bodyFont
          const sliceWidth = ctx.measureText(slice).width
          if (slice.trim().length > 0) words.push({ text: slice, x, y: lineTop, width: sliceWidth })
          x += sliceWidth
        } else {
          if (segText.trim().length > 0) words.push({ text: segText, x, y: lineTop, width: segWidth })
          x += segWidth
        }

        segIdx++
        gIdx = 0
        if (segIdx > line.end.segmentIndex) break
        if (segIdx === line.end.segmentIndex && line.end.graphemeIndex === 0) break
      }

      cursor = line.end
    }

    if (done) break
    lineTop += lineHeight
  }

  return words
}

// --- Drawing helpers ---
function drawGear(gear: Gear) {
  const { x, y, radius, teeth, angle, color } = gear
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)

  // Gear body
  ctx.beginPath()
  const innerR = radius * 0.7
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2
    const a1 = ((i + 0.3) / teeth) * Math.PI * 2
    const a2 = ((i + 0.5) / teeth) * Math.PI * 2
    const a3 = ((i + 0.8) / teeth) * Math.PI * 2
    if (i === 0) ctx.moveTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR)
    else ctx.lineTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR)
    ctx.lineTo(Math.cos(a1) * radius, Math.sin(a1) * radius)
    ctx.lineTo(Math.cos(a2) * radius, Math.sin(a2) * radius)
    ctx.lineTo(Math.cos(a3) * innerR, Math.sin(a3) * innerR)
  }
  ctx.closePath()

  const grad = ctx.createRadialGradient(0, 0, innerR * 0.3, 0, 0, radius)
  grad.addColorStop(0, color + 'cc')
  grad.addColorStop(0.6, color + '99')
  grad.addColorStop(1, color + '66')
  ctx.fillStyle = grad
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Hub
  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.18, 0, Math.PI * 2)
  ctx.fillStyle = '#222'
  ctx.fill()
  ctx.strokeStyle = color + 'aa'
  ctx.lineWidth = 2
  ctx.stroke()

  // Spokes
  ctx.strokeStyle = color + '44'
  ctx.lineWidth = 1.5
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * radius * 0.22, Math.sin(a) * radius * 0.22)
    ctx.lineTo(Math.cos(a) * innerR * 0.9, Math.sin(a) * innerR * 0.9)
    ctx.stroke()
  }

  ctx.restore()
}

function drawPendulum() {
  const bobX = pendulum.pivotX + Math.sin(pendulum.angle) * pendulum.length
  const bobY = pendulum.pivotY + Math.cos(pendulum.angle) * pendulum.length

  // Rod
  ctx.beginPath()
  ctx.moveTo(pendulum.pivotX, pendulum.pivotY)
  ctx.lineTo(bobX, bobY)
  ctx.strokeStyle = '#665544'
  ctx.lineWidth = 3
  ctx.stroke()

  // Pivot
  ctx.beginPath()
  ctx.arc(pendulum.pivotX, pendulum.pivotY, 5, 0, Math.PI * 2)
  ctx.fillStyle = '#888'
  ctx.fill()
  ctx.strokeStyle = '#555'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Bob with metallic gradient
  const bobGrad = ctx.createRadialGradient(bobX - 3, bobY - 3, 2, bobX, bobY, pendulum.bobRadius)
  bobGrad.addColorStop(0, '#ffdd88')
  bobGrad.addColorStop(0.5, '#cc9933')
  bobGrad.addColorStop(1, '#885522')
  ctx.beginPath()
  ctx.arc(bobX, bobY, pendulum.bobRadius, 0, Math.PI * 2)
  ctx.fillStyle = bobGrad
  ctx.fill()
  ctx.strokeStyle = '#aa7733'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Glow
  const glowGrad = ctx.createRadialGradient(bobX, bobY, pendulum.bobRadius, bobX, bobY, pendulum.bobRadius + 10)
  glowGrad.addColorStop(0, 'rgba(255, 200, 80, 0.15)')
  glowGrad.addColorStop(1, 'transparent')
  ctx.fillStyle = glowGrad
  ctx.beginPath()
  ctx.arc(bobX, bobY, pendulum.bobRadius + 10, 0, Math.PI * 2)
  ctx.fill()
}

function drawConveyor(dt: number) {
  conveyor.phase += conveyor.speed * dt

  // Belt body
  const grad = ctx.createLinearGradient(conveyor.x, conveyor.y, conveyor.x, conveyor.y + conveyor.height)
  grad.addColorStop(0, '#3a3a4a')
  grad.addColorStop(0.5, '#2a2a35')
  grad.addColorStop(1, '#1a1a25')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.roundRect(conveyor.x, conveyor.y, conveyor.width, conveyor.height, 10)
  ctx.fill()
  ctx.strokeStyle = '#555566'
  ctx.lineWidth = 1
  ctx.stroke()

  // Belt treads
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(conveyor.x, conveyor.y, conveyor.width, conveyor.height, 10)
  ctx.clip()
  ctx.strokeStyle = 'rgba(100, 100, 120, 0.4)'
  ctx.lineWidth = 1
  const treadSpacing = 16
  const offset = conveyor.phase % treadSpacing
  for (let x = conveyor.x - treadSpacing + offset; x < conveyor.x + conveyor.width + treadSpacing; x += treadSpacing) {
    ctx.beginPath()
    ctx.moveTo(x, conveyor.y)
    ctx.lineTo(x - 4, conveyor.y + conveyor.height)
    ctx.stroke()
  }
  ctx.restore()

  // Rollers
  const rollerY = conveyor.y + conveyor.height / 2
  const numRollers = Math.floor(conveyor.width / conveyor.rollerSpacing)
  for (let i = 0; i <= numRollers; i++) {
    const rx = conveyor.x + i * conveyor.rollerSpacing
    const rollerAngle = conveyor.phase / conveyor.rollerRadius
    ctx.save()
    ctx.translate(rx, rollerY)
    ctx.beginPath()
    ctx.arc(0, 0, conveyor.rollerRadius, 0, Math.PI * 2)
    const rGrad = ctx.createRadialGradient(-2, -2, 1, 0, 0, conveyor.rollerRadius)
    rGrad.addColorStop(0, '#888')
    rGrad.addColorStop(1, '#444')
    ctx.fillStyle = rGrad
    ctx.fill()
    ctx.strokeStyle = '#666'
    ctx.lineWidth = 1
    ctx.stroke()
    // Spoke marks on roller
    ctx.rotate(rollerAngle)
    ctx.strokeStyle = 'rgba(200,200,200,0.3)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, -conveyor.rollerRadius * 0.7)
    ctx.lineTo(0, conveyor.rollerRadius * 0.7)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-conveyor.rollerRadius * 0.7, 0)
    ctx.lineTo(conveyor.rollerRadius * 0.7, 0)
    ctx.stroke()
    ctx.restore()
  }

  // Direction arrow
  ctx.save()
  ctx.globalAlpha = 0.3
  const arrowX = conveyor.x + conveyor.width / 2
  const arrowY = conveyor.y - 8
  ctx.beginPath()
  ctx.moveTo(arrowX - 15, arrowY)
  ctx.lineTo(arrowX + 10, arrowY)
  ctx.lineTo(arrowX + 10, arrowY - 3)
  ctx.lineTo(arrowX + 18, arrowY + 1)
  ctx.lineTo(arrowX + 10, arrowY + 5)
  ctx.lineTo(arrowX + 10, arrowY + 2)
  ctx.lineTo(arrowX - 15, arrowY + 2)
  ctx.closePath()
  ctx.fillStyle = '#aaa'
  ctx.fill()
  ctx.restore()
}

function drawRamps() {
  for (const ramp of ramps) {
    ctx.beginPath()
    ctx.moveTo(ramp.x1, ramp.y1)
    ctx.lineTo(ramp.x2, ramp.y2)
    const rampGrad = ctx.createLinearGradient(ramp.x1, ramp.y1, ramp.x2, ramp.y2)
    rampGrad.addColorStop(0, '#556677')
    rampGrad.addColorStop(1, '#445566')
    ctx.strokeStyle = rampGrad
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.stroke()

    // Highlight
    ctx.beginPath()
    ctx.moveTo(ramp.x1, ramp.y1 - 2)
    ctx.lineTo(ramp.x2, ramp.y2 - 2)
    ctx.strokeStyle = 'rgba(150, 180, 200, 0.2)'
    ctx.lineWidth = 1
    ctx.stroke()

    // End caps
    ctx.fillStyle = '#667788'
    ctx.beginPath()
    ctx.arc(ramp.x1, ramp.y1, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(ramp.x2, ramp.y2, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawBall() {
  if (!ball.active) return
  const bx = ball.body.position.x
  const by = ball.body.position.y

  // Trail
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  for (let i = 0; i < ball.trail.length; i++) {
    const t = ball.trail[i]!
    const alpha = Math.max(0, 1 - t.age / 0.5) * 0.3
    const size = ball.radius * (1 - t.age / 0.5) * 0.6
    if (alpha > 0 && size > 0) {
      ctx.fillStyle = `rgba(255, 180, 60, ${alpha})`
      ctx.beginPath()
      ctx.arc(t.x, t.y, size, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()

  // Glow
  const glowGrad = ctx.createRadialGradient(bx, by, ball.radius * 0.5, bx, by, ball.radius * 2.5)
  glowGrad.addColorStop(0, 'rgba(255, 200, 80, 0.2)')
  glowGrad.addColorStop(1, 'transparent')
  ctx.fillStyle = glowGrad
  ctx.beginPath()
  ctx.arc(bx, by, ball.radius * 2.5, 0, Math.PI * 2)
  ctx.fill()

  // Ball
  const ballGrad = ctx.createRadialGradient(bx - 2, by - 2, 1, bx, by, ball.radius)
  ballGrad.addColorStop(0, '#fff')
  ballGrad.addColorStop(0.3, '#ffcc66')
  ballGrad.addColorStop(1, '#cc7722')
  ctx.fillStyle = ballGrad
  ctx.beginPath()
  ctx.arc(bx, by, ball.radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#aa6622'
  ctx.lineWidth = 1.2
  ctx.stroke()
}

// --- Main loop ---
const FIXED_DT = 1 / 120
const MAX_SUBSTEPS = 6
let accumulator = 0
let lastTime = performance.now()
let time = 0

function frame(now: number) {
  const elapsed = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now
  accumulator += elapsed
  time += elapsed

  // --- Update gears ---
  for (const gear of gears) {
    gear.angle += gear.speed * elapsed
  }

  // --- Update pendulum (simple harmonic + damping) ---
  const g = 9.81
  const pendulumAccel = -(g / (pendulum.length * 0.01)) * Math.sin(pendulum.angle)
  pendulum.angularVel += pendulumAccel * elapsed
  pendulum.angularVel *= 0.999
  pendulum.angle += pendulum.angularVel * elapsed

  // --- Update conveyor phase (for drawing) ---
  // (already handled in drawConveyor)

  // --- Physics step ---
  let steps = 0
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    step(world, FIXED_DT)
    accumulator -= FIXED_DT
    steps++
  }

  // --- Ball collisions with machine parts ---
  collideBallWithRamps()
  collideBallWithGears()
  collideBallWithPendulum()
  collideBallWithConveyor()

  // Wall bounds for ball
  if (ball.active) {
    if (ball.body.position.x < marginX + ball.radius) {
      ball.body.position.x = marginX + ball.radius
      ball.body.velocity.x = Math.abs(ball.body.velocity.x) * 0.7
    }
    if (ball.body.position.x > W - marginX - ball.radius) {
      ball.body.position.x = W - marginX - ball.radius
      ball.body.velocity.x = -Math.abs(ball.body.velocity.x) * 0.7
    }
    if (ball.body.position.y > H + 50) {
      ball.active = false
    }
  }

  // Ball trail
  if (ball.active) {
    const speed = Math.sqrt(ball.body.velocity.x ** 2 + ball.body.velocity.y ** 2)
    if (speed > 30) {
      ball.trail.push({ x: ball.body.position.x, y: ball.body.position.y, age: 0 })
    }
    for (let i = ball.trail.length - 1; i >= 0; i--) {
      ball.trail[i]!.age += elapsed
      if (ball.trail[i]!.age > 0.5) ball.trail.splice(i, 1)
    }
  }

  // --- Update sparks ---
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]!
    s.x += s.vx * elapsed
    s.y += s.vy * elapsed
    s.vy += 300 * elapsed
    s.life += elapsed
    if (s.life > s.maxLife) sparks.splice(i, 1)
  }

  // --- Render ---
  ctx.clearRect(0, 0, W, H)

  // --- Reflow text around machine ---
  const words = layoutAroundMachine()

  ctx.font = bodyFont
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  for (const w of words) {
    let distMin = Infinity
    // Distance to nearest machine part
    for (const gear of gears) {
      const dx = (w.x + w.width / 2) - gear.x
      const dy = (w.y + lineHeight / 2) - gear.y
      distMin = Math.min(distMin, Math.sqrt(dx * dx + dy * dy) - gear.radius)
    }
    if (ball.active) {
      const dx = (w.x + w.width / 2) - ball.body.position.x
      const dy = (w.y + lineHeight / 2) - ball.body.position.y
      distMin = Math.min(distMin, Math.sqrt(dx * dx + dy * dy) - ball.radius)
    }
    const bobX2 = pendulum.pivotX + Math.sin(pendulum.angle) * pendulum.length
    const bobY2 = pendulum.pivotY + Math.cos(pendulum.angle) * pendulum.length
    const dx2 = (w.x + w.width / 2) - bobX2
    const dy2 = (w.y + lineHeight / 2) - bobY2
    distMin = Math.min(distMin, Math.sqrt(dx2 * dx2 + dy2 * dy2) - pendulum.bobRadius)

    const proximity = Math.max(0, 1 - distMin / 50)
    if (proximity > 0.01) {
      const r = Math.round(144 + proximity * 100)
      const g2 = Math.round(140 + proximity * 80)
      const b2 = Math.round(120 + proximity * 20)
      ctx.fillStyle = `rgba(${r}, ${g2}, ${b2}, ${0.6 + proximity * 0.4})`
    } else {
      ctx.fillStyle = 'rgba(160, 155, 145, 0.7)'
    }
    ctx.fillText(w.text, w.x, w.y)
  }

  // --- Draw machine components ---
  drawRamps()
  drawConveyor(elapsed)
  for (const gear of gears) drawGear(gear)
  drawPendulum()
  drawBall()

  // --- Draw sparks ---
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  for (const s of sparks) {
    const t = s.life / s.maxLife
    const alpha = 1 - t * t
    const size = s.size * (1 - t * 0.5)
    ctx.fillStyle = s.color
    ctx.globalAlpha = alpha
    ctx.beginPath()
    ctx.arc(s.x, s.y, size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // --- Caption ---
  ctx.font = 'italic 11px Georgia, "Times New Roman", serif'
  ctx.fillStyle = '#5a4a3a'
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'center'
  ctx.fillText('layoutNextLine() reflows text around gears, pendulum, ramps, and conveyor — click to drop a ball', W / 2, H - 10)

  // Launch hint
  if (!ball.active) {
    ctx.font = '13px -apple-system, sans-serif'
    ctx.fillStyle = 'rgba(255, 180, 60, 0.5)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('Click to drop a ball into the machine', W / 2, H - 35)
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
