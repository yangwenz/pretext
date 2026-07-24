import { prepareWithSegments, layoutNextLine, type LayoutCursor } from '../../src/layout.js'
import { createWorld, createBody, step } from '../../src/physics/index.js'
import type { Body } from '../../src/physics/types.js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const dpr = window.devicePixelRatio || 1

const W = Math.min(800, window.innerWidth - 48)
const H = 750
canvas.width = W * dpr
canvas.height = H * dpr
canvas.style.width = `${W}px`
canvas.style.height = `${H}px`
ctx.scale(dpr, dpr)

const bodyFont = '15px Georgia, "Times New Roman", serif'
const lineHeight = 22
const marginX = 30
const textStartY = 30

const documentText = `Every arcade has its physics. The silver ball obeys gravity, rebounds off rubber, transfers momentum to bumpers that flash and ring. Between the chaos of trajectories, the playfield has a geography — ramps, lanes, targets, each one a destination the ball might reach if struck at just the right angle. The flippers are the only democracy in pinball: everything else is fate and geometry, but those two paddles belong to you. Press the buttons and you own a fraction of a second, a sliver of agency in a machine designed to take your money. The tilt sensor watches for desperation. The drain waits below, patient as gravity. But for one perfect shot — the ball climbing the left orbit, curving through the spinner, triggering the multiball — for that one moment, you are the architect of chaos, and the machine sings your score in lights. The first pinball machines had no flippers at all. Players could only nudge the cabinet, coaxing the ball sideways with body English and prayer. The addition of flippers in 1947 transformed pinball from gambling device to skill game, and saved it from prohibition. Every machine since has been a conversation between luck and control, between the designer who hid the secrets and the player who discovers them one quarter at a time. The greatest players read the geometry of the table like a language — they know which angles produce which results, which bumpers feed which lanes, which moments demand patience and which demand violence. They do not fight the physics; they collaborate with it. The ball is not an enemy to be defeated but a partner to be guided. And when the last ball drains and the match digits spin, there is always the same question: one more game?`

const prepared = prepareWithSegments(documentText, bodyFont)
const internalWidths: number[] = (prepared as any).widths
const segments: string[] = prepared.segments

// --- Physics world ---
const world = createWorld({
  gravity: { x: 0, y: 600 },
  bounds: { x: 0, y: 0, width: W, height: H + 100 },
  iterations: 6,
  damping: 0.997,
  sleepThresholdVel: 0.5,
  sleepDelay: 60,
})

// --- Ball ---
const BALL_RADIUS = 10
let ball: Body = createBall()

function createBall(): Body {
  return createBody(world, '●', bodyFont, {
    position: { x: W / 2, y: FLIPPER_Y - 30 },
    mass: 1,
    width: BALL_RADIUS * 2,
    height: BALL_RADIUS * 2,
    restitution: 0.75,
    friction: 0.02,
    collisionGroup: 0,
  })
}

// --- Bumpers (circular) ---
type Bumper = { body: Body; radius: number; flashTime: number; color: string }
const bumpers: Bumper[] = []

const bumperDefs = [
  // Top triangle cluster
  { x: W * 0.5, y: H * 0.18, r: 22, color: '#feca57' },
  { x: W * 0.37, y: H * 0.26, r: 20, color: '#ff6b6b' },
  { x: W * 0.63, y: H * 0.26, r: 20, color: '#48dbfb' },
  // Middle row
  { x: W * 0.28, y: H * 0.38, r: 18, color: '#54a0ff' },
  { x: W * 0.5, y: H * 0.36, r: 22, color: '#ff9ff3' },
  { x: W * 0.72, y: H * 0.38, r: 18, color: '#69f0ae' },
  // Lower pair
  { x: W * 0.38, y: H * 0.50, r: 20, color: '#f9a825' },
  { x: W * 0.62, y: H * 0.50, r: 20, color: '#ff6b6b' },
]

for (const def of bumperDefs) {
  const body = createBody(world, '◉', bodyFont, {
    position: { x: def.x, y: def.y },
    mass: Infinity,
    width: def.r * 2,
    height: def.r * 2,
    restitution: 1.5,
    collisionGroup: 1,
  })
  bumpers.push({ body, radius: def.r, flashTime: 0, color: def.color })
}

// --- Pegs (small static pins scattered between bumpers) ---
type Peg = { x: number; y: number; radius: number; flashTime: number }
const pegs: Peg[] = []

const pegPositions = [
  // Row between top and mid bumpers
  { x: W * 0.30, y: H * 0.15 },
  { x: W * 0.42, y: H * 0.13 },
  { x: W * 0.58, y: H * 0.13 },
  { x: W * 0.70, y: H * 0.15 },
  // Staggered mid rows
  { x: W * 0.22, y: H * 0.30 },
  { x: W * 0.78, y: H * 0.30 },
  { x: W * 0.35, y: H * 0.44 },
  { x: W * 0.50, y: H * 0.44 },
  { x: W * 0.65, y: H * 0.44 },
  // Lower area
  { x: W * 0.25, y: H * 0.55 },
  { x: W * 0.50, y: H * 0.57 },
  { x: W * 0.75, y: H * 0.55 },
  { x: W * 0.33, y: H * 0.63 },
  { x: W * 0.67, y: H * 0.63 },
]

for (const pos of pegPositions) {
  let tooClose = false
  for (const b of bumpers) {
    const dx = pos.x - b.body.position.x
    const dy = pos.y - b.body.position.y
    if (Math.sqrt(dx * dx + dy * dy) < b.radius + 15) { tooClose = true; break }
  }
  if (!tooClose) {
    pegs.push({ x: pos.x, y: pos.y, radius: 4, flashTime: 0 })
  }
}

// --- Slingshots (angled wall kickers funneling toward flippers) ---
type Slingshot = { x1: number; y1: number; x2: number; y2: number; flashTime: number; side: 'left' | 'right' }
const slingshots: Slingshot[] = [
  { x1: W * 0.18, y1: H * 0.68, x2: W * 0.30, y2: H * 0.78, flashTime: 0, side: 'left' },
  { x1: W * 0.82, y1: H * 0.68, x2: W * 0.70, y2: H * 0.78, flashTime: 0, side: 'right' },
]

// --- Drop targets (small rectangles, disappear when hit) ---
type DropTarget = { x: number; y: number; width: number; height: number; alive: boolean; color: string; respawnTime: number }
const dropTargets: DropTarget[] = []

const targetColors = ['#ff6b6b', '#feca57', '#48dbfb', '#69f0ae', '#ff9ff3']
for (let i = 0; i < 5; i++) {
  dropTargets.push({
    x: W * 0.30 + i * (W * 0.40 / 4) - 10,
    y: H * 0.08,
    width: 20,
    height: 10,
    alive: true,
    color: targetColors[i]!,
    respawnTime: 0,
  })
}

// --- Flippers ---
const FLIPPER_LENGTH = 100
const FLIPPER_WIDTH = 14
const FLIPPER_Y = H - 100
const LEFT_FLIPPER_X = W * 0.35
const RIGHT_FLIPPER_X = W * 0.65
let leftFlipperAngle = 0.3
let rightFlipperAngle = 0.3
let leftFlipperTarget = 0.3
let rightFlipperTarget = 0.3

// --- Input ---
let launched = false

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'z') leftFlipperTarget = -0.5
  if (e.key === 'ArrowRight' || e.key === '/') rightFlipperTarget = -0.5
  if (e.key === ' ') launchBall()
})

document.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'z') leftFlipperTarget = 0.3
  if (e.key === 'ArrowRight' || e.key === '/') rightFlipperTarget = 0.3
})

canvas.addEventListener('click', launchBall)

function launchBall() {
  if (!launched || ball.position.y > H + 50) {
    ball.position.x = W / 2
    ball.position.y = FLIPPER_Y - 30
    ball.velocity.x = (Math.random() - 0.5) * 80
    ball.velocity.y = -800 - Math.random() * 200
    ball.sleeping = false
    ball.sleepTimer = 0
    launched = true
  }
}

// --- Score ---
let score = 0

// --- Flipper collision ---
function flipperCollide(flipperX: number, flipperAngle: number, isLeft: boolean) {
  const cosA = Math.cos(flipperAngle)
  const sinA = Math.sin(flipperAngle)
  const endX = flipperX + (isLeft ? 1 : -1) * cosA * FLIPPER_LENGTH
  const endY = FLIPPER_Y + sinA * FLIPPER_LENGTH

  // Project ball onto flipper line segment
  const dx = endX - flipperX
  const dy = endY - FLIPPER_Y
  const len = Math.sqrt(dx * dx + dy * dy)
  const nx = dx / len
  const ny = dy / len

  const bx = ball.position.x - flipperX
  const by = ball.position.y - FLIPPER_Y
  const proj = bx * nx + by * ny
  const clampedProj = Math.max(0, Math.min(len, proj))

  const closestX = flipperX + nx * clampedProj
  const closestY = FLIPPER_Y + ny * clampedProj

  const distX = ball.position.x - closestX
  const distY = ball.position.y - closestY
  const dist = Math.sqrt(distX * distX + distY * distY)

  if (dist < BALL_RADIUS + FLIPPER_WIDTH / 2) {
    // Push ball away
    const overlap = BALL_RADIUS + FLIPPER_WIDTH / 2 - dist
    const normX = distX / (dist || 1)
    const normY = distY / (dist || 1)
    ball.position.x += normX * overlap
    ball.position.y += normY * overlap

    // Flipper hit — boost if flipper is moving up
    const flipperVel = (isLeft ? leftFlipperTarget - leftFlipperAngle : rightFlipperTarget - rightFlipperAngle) * 15
    ball.velocity.x += normX * Math.abs(flipperVel) * 30
    ball.velocity.y += normY * Math.abs(flipperVel) * 30 - Math.abs(flipperVel) * 20
    ball.sleeping = false
    ball.sleepTimer = 0
  }
}

// --- Bumper collision ---
function bumperCollisions() {
  for (const bumper of bumpers) {
    const dx = ball.position.x - bumper.body.position.x
    const dy = ball.position.y - bumper.body.position.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < BALL_RADIUS + bumper.radius) {
      const overlap = BALL_RADIUS + bumper.radius - dist
      const nx = dx / (dist || 1)
      const ny = dy / (dist || 1)
      ball.position.x += nx * overlap
      ball.position.y += ny * overlap
      const bounce = 350
      ball.velocity.x += nx * bounce
      ball.velocity.y += ny * bounce
      ball.sleeping = false
      ball.sleepTimer = 0
      bumper.flashTime = time
      score += 100
    }
  }
}

// --- Peg collision ---
function pegCollisions() {
  for (const peg of pegs) {
    const dx = ball.position.x - peg.x
    const dy = ball.position.y - peg.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < BALL_RADIUS + peg.radius) {
      const overlap = BALL_RADIUS + peg.radius - dist
      const nx = dx / (dist || 1)
      const ny = dy / (dist || 1)
      ball.position.x += nx * overlap
      ball.position.y += ny * overlap
      ball.velocity.x += nx * 120
      ball.velocity.y += ny * 120
      ball.sleeping = false
      ball.sleepTimer = 0
      peg.flashTime = time
      score += 10
    }
  }
}

// --- Slingshot collision ---
function slingshotCollisions() {
  for (const sl of slingshots) {
    // Line segment collision
    const sx = sl.x2 - sl.x1
    const sy = sl.y2 - sl.y1
    const len = Math.sqrt(sx * sx + sy * sy)
    const nx = sx / len
    const ny = sy / len

    const bx = ball.position.x - sl.x1
    const by = ball.position.y - sl.y1
    const proj = bx * nx + by * ny
    const clamped = Math.max(0, Math.min(len, proj))

    const closestX = sl.x1 + nx * clamped
    const closestY = sl.y1 + ny * clamped

    const distX = ball.position.x - closestX
    const distY = ball.position.y - closestY
    const dist = Math.sqrt(distX * distX + distY * distY)

    if (dist < BALL_RADIUS + 6) {
      const overlap = BALL_RADIUS + 6 - dist
      const normX = distX / (dist || 1)
      const normY = distY / (dist || 1)
      ball.position.x += normX * overlap
      ball.position.y += normY * overlap
      // Kick away hard
      ball.velocity.x += normX * 500
      ball.velocity.y += normY * 500
      ball.sleeping = false
      ball.sleepTimer = 0
      sl.flashTime = time
      score += 50
    }
  }
}

// --- Drop target collision ---
function dropTargetCollisions() {
  for (const t of dropTargets) {
    if (!t.alive) continue
    const cx = t.x + t.width / 2
    const cy = t.y + t.height / 2
    const dx = Math.abs(ball.position.x - cx) - t.width / 2
    const dy = Math.abs(ball.position.y - cy) - t.height / 2
    const dist = Math.max(dx, 0) * Math.max(dx, 0) + Math.max(dy, 0) * Math.max(dy, 0)
    if (dist < BALL_RADIUS * BALL_RADIUS) {
      t.alive = false
      t.respawnTime = time + 5
      ball.velocity.y = Math.abs(ball.velocity.y) * 0.5
      score += 200
    }
  }
  // Respawn targets
  for (const t of dropTargets) {
    if (!t.alive && time > t.respawnTime) {
      t.alive = true
    }
  }
}

// --- Text layout around bumpers, ball, flippers ---
type PositionedWord = { text: string; x: number; y: number; width: number }

function layoutAroundObjects(): PositionedWord[] {
  const words: PositionedWord[] = []
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let lineTop = textStartY
  const regionLeft = marginX
  const regionRight = W - marginX

  while (lineTop + lineHeight < H - 30) {
    const bandTop = lineTop
    const bandBottom = lineTop + lineHeight
    const blocked: { left: number; right: number }[] = []

    // Bumpers
    for (const b of bumpers) {
      const bTop = b.body.position.y - b.radius - 4
      const bBot = b.body.position.y + b.radius + 4
      if (bBot > bandTop && bTop < bandBottom) {
        blocked.push({
          left: b.body.position.x - b.radius - 6,
          right: b.body.position.x + b.radius + 6,
        })
      }
    }

    // Ball
    if (launched) {
      const ballTop = ball.position.y - BALL_RADIUS - 4
      const ballBot = ball.position.y + BALL_RADIUS + 4
      if (ballBot > bandTop && ballTop < bandBottom) {
        blocked.push({
          left: ball.position.x - BALL_RADIUS - 6,
          right: ball.position.x + BALL_RADIUS + 6,
        })
      }
    }

    // Pegs
    for (const p of pegs) {
      if (p.y + p.radius + 2 > bandTop && p.y - p.radius - 2 < bandBottom) {
        blocked.push({ left: p.x - p.radius - 4, right: p.x + p.radius + 4 })
      }
    }

    // Drop targets
    for (const t of dropTargets) {
      if (t.alive && t.y + t.height > bandTop && t.y < bandBottom) {
        blocked.push({ left: t.x - 4, right: t.x + t.width + 4 })
      }
    }

    // Slingshots
    for (const sl of slingshots) {
      const minY = Math.min(sl.y1, sl.y2) - 6
      const maxY = Math.max(sl.y1, sl.y2) + 6
      if (maxY > bandTop && minY < bandBottom) {
        const minX = Math.min(sl.x1, sl.x2) - 8
        const maxX = Math.max(sl.x1, sl.x2) + 8
        blocked.push({ left: minX, right: maxX })
      }
    }

    // Flippers region
    if (FLIPPER_Y - FLIPPER_WIDTH > bandTop - lineHeight && FLIPPER_Y + FLIPPER_WIDTH < bandBottom + lineHeight) {
      if (bandTop < FLIPPER_Y + FLIPPER_WIDTH && bandBottom > FLIPPER_Y - FLIPPER_WIDTH) {
        blocked.push({ left: LEFT_FLIPPER_X - 10, right: LEFT_FLIPPER_X + FLIPPER_LENGTH + 10 })
        blocked.push({ left: RIGHT_FLIPPER_X - FLIPPER_LENGTH - 10, right: RIGHT_FLIPPER_X + 10 })
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

// --- Render ---
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

  // Animate flippers
  leftFlipperAngle += (leftFlipperTarget - leftFlipperAngle) * Math.min(1, elapsed * 25)
  rightFlipperAngle += (rightFlipperTarget - rightFlipperAngle) * Math.min(1, elapsed * 25)

  // Wall collisions for ball
  if (ball.position.x < marginX + BALL_RADIUS) {
    ball.position.x = marginX + BALL_RADIUS
    ball.velocity.x = Math.abs(ball.velocity.x) * 0.8
  }
  if (ball.position.x > W - marginX - BALL_RADIUS) {
    ball.position.x = W - marginX - BALL_RADIUS
    ball.velocity.x = -Math.abs(ball.velocity.x) * 0.8
  }
  if (ball.position.y < BALL_RADIUS + 10) {
    ball.position.y = BALL_RADIUS + 10
    ball.velocity.y = Math.abs(ball.velocity.y) * 0.8
  }

  // Flipper collision
  flipperCollide(LEFT_FLIPPER_X, leftFlipperAngle, true)
  flipperCollide(RIGHT_FLIPPER_X, rightFlipperAngle, false)

  // Bumper collision
  bumperCollisions()
  pegCollisions()
  slingshotCollisions()
  dropTargetCollisions()

  let steps = 0
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    step(world, FIXED_DT)
    accumulator -= FIXED_DT
    steps++
  }

  // Reset ball if it falls off
  if (ball.position.y > H + 50) {
    launched = false
  }

  // --- Render ---
  ctx.clearRect(0, 0, W, H)

  // Playfield border
  ctx.strokeStyle = 'rgba(80, 100, 180, 0.15)'
  ctx.lineWidth = 2
  ctx.strokeRect(marginX - 2, 8, W - marginX * 2 + 4, H - 16)

  // --- Reflow text ---
  const words = layoutAroundObjects()

  ctx.font = bodyFont
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  for (const w of words) {
    ctx.fillStyle = '#908a84'
    ctx.globalAlpha = 0.75
    ctx.fillText(w.text, w.x, w.y)
  }
  ctx.globalAlpha = 1

  // --- Draw bumpers ---
  for (const b of bumpers) {
    const flash = Math.max(0, 1 - (time - b.flashTime) * 4)
    const bx = b.body.position.x
    const by = b.body.position.y

    // Glow on hit
    if (flash > 0) {
      const glow = ctx.createRadialGradient(bx, by, b.radius * 0.5, bx, by, b.radius * 2.5)
      glow.addColorStop(0, b.color + Math.round(flash * 80).toString(16).padStart(2, '0'))
      glow.addColorStop(1, 'transparent')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(bx, by, b.radius * 2.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // Bumper body
    const grad = ctx.createRadialGradient(bx - b.radius * 0.2, by - b.radius * 0.2, 1, bx, by, b.radius)
    grad.addColorStop(0, '#fff')
    grad.addColorStop(0.3, b.color)
    grad.addColorStop(1, b.color + '88')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(bx, by, b.radius, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = b.color
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  // --- Draw pegs ---
  for (const p of pegs) {
    const flash = Math.max(0, 1 - (time - p.flashTime) * 6)
    if (flash > 0) {
      ctx.fillStyle = `rgba(200, 220, 255, ${flash * 0.3})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius * 3, 0, Math.PI * 2)
      ctx.fill()
    }
    const pegGrad = ctx.createRadialGradient(p.x - 1, p.y - 1, 0, p.x, p.y, p.radius)
    pegGrad.addColorStop(0, '#eee')
    pegGrad.addColorStop(1, '#666')
    ctx.fillStyle = pegGrad
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
    ctx.fill()
  }

  // --- Draw slingshots ---
  for (const sl of slingshots) {
    const flash = Math.max(0, 1 - (time - sl.flashTime) * 5)
    ctx.strokeStyle = flash > 0 ? `rgba(255, 200, 50, ${0.6 + flash * 0.4})` : 'rgba(200, 180, 100, 0.6)'
    ctx.lineWidth = flash > 0 ? 5 : 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(sl.x1, sl.y1)
    ctx.lineTo(sl.x2, sl.y2)
    ctx.stroke()
    // End caps
    ctx.fillStyle = '#aa8833'
    ctx.beginPath()
    ctx.arc(sl.x1, sl.y1, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(sl.x2, sl.y2, 4, 0, Math.PI * 2)
    ctx.fill()
  }

  // --- Draw drop targets ---
  for (const t of dropTargets) {
    if (!t.alive) continue
    ctx.fillStyle = t.color
    ctx.beginPath()
    ctx.roundRect(t.x, t.y, t.width, t.height, 3)
    ctx.fill()
    ctx.strokeStyle = t.color + 'cc'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // --- Draw flippers ---
  function drawFlipper(fx: number, angle: number, isLeft: boolean) {
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)
    const dir = isLeft ? 1 : -1
    const endX = fx + dir * cosA * FLIPPER_LENGTH
    const endY = FLIPPER_Y + sinA * FLIPPER_LENGTH

    ctx.lineCap = 'round'
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = FLIPPER_WIDTH
    ctx.beginPath()
    ctx.moveTo(fx, FLIPPER_Y)
    ctx.lineTo(endX, endY)
    ctx.stroke()

    // Pivot
    ctx.fillStyle = '#666'
    ctx.beginPath()
    ctx.arc(fx, FLIPPER_Y, 5, 0, Math.PI * 2)
    ctx.fill()
  }
  drawFlipper(LEFT_FLIPPER_X, leftFlipperAngle, true)
  drawFlipper(RIGHT_FLIPPER_X, rightFlipperAngle, false)

  // --- Draw ball ---
  if (launched) {
    const ballGlow = ctx.createRadialGradient(ball.position.x, ball.position.y, BALL_RADIUS * 0.3, ball.position.x, ball.position.y, BALL_RADIUS * 2)
    ballGlow.addColorStop(0, 'rgba(200, 220, 255, 0.2)')
    ballGlow.addColorStop(1, 'transparent')
    ctx.fillStyle = ballGlow
    ctx.beginPath()
    ctx.arc(ball.position.x, ball.position.y, BALL_RADIUS * 2, 0, Math.PI * 2)
    ctx.fill()

    const bGrad = ctx.createRadialGradient(ball.position.x - 2, ball.position.y - 2, 1, ball.position.x, ball.position.y, BALL_RADIUS)
    bGrad.addColorStop(0, '#fff')
    bGrad.addColorStop(0.5, '#c0c8d8')
    bGrad.addColorStop(1, '#7080a0')
    ctx.fillStyle = bGrad
    ctx.beginPath()
    ctx.arc(ball.position.x, ball.position.y, BALL_RADIUS, 0, Math.PI * 2)
    ctx.fill()
  }

  // --- Score ---
  ctx.font = 'bold 16px -apple-system, sans-serif'
  ctx.fillStyle = '#6c8aff'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'right'
  ctx.fillText(`${score}`, W - marginX, 14)

  // Launch hint
  if (!launched) {
    ctx.font = '13px -apple-system, sans-serif'
    ctx.fillStyle = 'rgba(108, 138, 255, 0.6)'
    ctx.textAlign = 'center'
    ctx.fillText('SPACE or CLICK to launch', W / 2, H - 50)
  }

  // Caption
  ctx.font = 'italic 11px Georgia, "Times New Roman", serif'
  ctx.fillStyle = '#3a3a5a'
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'center'
  ctx.fillText('layoutNextLine() reflows text around bumpers, ball, and flippers — arrows for flippers, space to launch', W / 2, H - 12)

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
