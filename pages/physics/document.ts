import { prepareWithSegments, layoutNextLine, type LayoutCursor } from '../../src/layout.js'
import { createWorld, createBody, createConnection, step } from '../../src/physics/index.js'
import type { Body } from '../../src/physics/types.js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const dpr = window.devicePixelRatio || 1

const W = Math.min(900, window.innerWidth - 48)
const H = 620
canvas.width = W * dpr
canvas.height = H * dpr
canvas.style.width = `${W}px`
canvas.style.height = `${H}px`
ctx.scale(dpr, dpr)

// --- Fonts and layout ---
const bodyFont = '16px Georgia, "Times New Roman", serif'
const lineHeight = 26
const marginX = 50
const fullWidth = W - marginX * 2
const textStartY = 50

// --- Document text prepared by pretext ---
const documentText = `In classical mechanics, momentum is the product of mass and velocity. Newton's third law implies that the total momentum of a closed system remains constant. This principle is beautifully demonstrated by the apparatus you see here — balls swing on pendulums embedded within this paragraph. As they move, the text reflows around them in real time. Each line is laid out by pretext's layoutNextLine API with a width that accounts for the current ball positions. When a ball swings into a line's band, that line gets shorter to make room. The text wraps naturally around the obstacle, just as CSS would flow text around a float — except here the float is animated by a physics engine. Drag any ball to disturb it. Watch how the surrounding paragraph reshapes itself every frame to accommodate the motion. This is the real integration: pretext handles line-breaking and text shaping, the physics engine handles forces and collisions, and they communicate through obstacle geometry each frame.`

const prepared = prepareWithSegments(documentText, bodyFont)

// --- Five small balls ---
const ballCount = 5
const ballColors = ['#ff6b6b', '#48dbfb', '#feca57', '#ff9ff3', '#54a0ff']
const ballRadius = 14

// --- Physics world ---
const world = createWorld({
  gravity: { x: 0, y: 0 },
  bounds: { x: marginX, y: 0, width: fullWidth, height: H },
  iterations: 10,
  damping: 0.9995,
  sleepThresholdVel: 0.05,
  sleepDelay: 300,
})

// Cradle geometry
const ropeLength = 160
const anchorY = textStartY - 20
const cradleGravity = 500
const ballSpacing = 34
const cradleCenterX = W / 2

type CradleBall = {
  anchor: Body
  ball: Body
  color: string
}

const cradleBalls: CradleBall[] = []
const cradleStartX = cradleCenterX - ((ballCount - 1) * ballSpacing) / 2

for (let i = 0; i < ballCount; i++) {
  const color = ballColors[i]!
  const x = cradleStartX + i * ballSpacing

  const anchor = createBody(world, '·', bodyFont, {
    position: { x, y: anchorY },
    mass: Infinity,
    width: 4,
    height: 4,
    collisionGroup: i + 100,
  })

  const ball = createBody(world, '●', bodyFont, {
    position: { x, y: anchorY + ropeLength },
    mass: 5,
    width: ballRadius * 2,
    height: ballRadius * 2,
    restitution: 0.98,
    friction: 0.0,
    collisionGroup: 0,
  })

  createConnection(world, {
    type: 'rigid',
    a: anchor.id,
    b: ball.id,
    length: ropeLength,
  })

  cradleBalls.push({ anchor, ball, color })
}

// Pull left ball
const leftBall = cradleBalls[0]!
const pullAngle = -Math.PI / 3.5
leftBall.ball.position.x = leftBall.anchor.position.x + Math.sin(pullAngle) * ropeLength
leftBall.ball.position.y = leftBall.anchor.position.y + Math.cos(pullAngle) * ropeLength

// --- Drag ---
let dragIdx = -1

canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  for (let i = 0; i < cradleBalls.length; i++) {
    const ball = cradleBalls[i]!.ball
    const dx = mx - ball.position.x
    const dy = my - ball.position.y
    if (dx * dx + dy * dy < (ballRadius + 8) * (ballRadius + 8)) {
      dragIdx = i
      ball.mass = Infinity
      break
    }
  }
})

canvas.addEventListener('mousemove', (e) => {
  if (dragIdx < 0) return
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const cb = cradleBalls[dragIdx]!
  const ax = cb.anchor.position.x
  const ay = cb.anchor.position.y
  const dx = mx - ax
  const dy = my - ay
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  cb.ball.position.x = ax + (dx / dist) * ropeLength
  cb.ball.position.y = ay + (dy / dist) * ropeLength
  cb.ball.velocity.x = 0
  cb.ball.velocity.y = 0
})

function releaseDrag() {
  if (dragIdx >= 0) {
    cradleBalls[dragIdx]!.ball.mass = 5
    cradleBalls[dragIdx]!.ball.sleeping = false
    cradleBalls[dragIdx]!.ball.sleepTimer = 0
    dragIdx = -1
  }
}

canvas.addEventListener('mouseup', releaseDrag)
canvas.addEventListener('mouseleave', releaseDrag)

// --- Obstacle-aware layout: reflow text around ball positions each frame ---
type PositionedLine = { x: number; y: number; text: string; width: number }

function layoutAroundBalls(): PositionedLine[] {
  const lines: PositionedLine[] = []
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let lineTop = textStartY

  while (lineTop + lineHeight < H - 30) {
    const bandTop = lineTop
    const bandBottom = lineTop + lineHeight

    // Find which balls overlap this line band
    const blocked: { left: number; right: number }[] = []
    for (const cb of cradleBalls) {
      const ballTop = cb.ball.position.y - ballRadius
      const ballBottom = cb.ball.position.y + ballRadius
      if (ballBottom > bandTop && ballTop < bandBottom) {
        blocked.push({
          left: cb.ball.position.x - ballRadius - 4,
          right: cb.ball.position.x + ballRadius + 4,
        })
      }
    }

    // Sort and merge overlapping intervals
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

    // Carve available slots
    const regionLeft = marginX
    const regionRight = W - marginX
    const slots: { left: number; right: number }[] = []
    let slotLeft = regionLeft
    for (const b of merged) {
      if (b.left > slotLeft) {
        slots.push({ left: slotLeft, right: b.left })
      }
      slotLeft = Math.max(slotLeft, b.right)
    }
    if (slotLeft < regionRight) {
      slots.push({ left: slotLeft, right: regionRight })
    }

    if (slots.length === 0) {
      lineTop += lineHeight
      continue
    }

    // Pick the widest slot
    let bestSlot = slots[0]!
    for (let i = 1; i < slots.length; i++) {
      const s = slots[i]!
      if (s.right - s.left > bestSlot.right - bestSlot.left) {
        bestSlot = s
      }
    }

    const availableWidth = bestSlot.right - bestSlot.left
    if (availableWidth < 40) {
      lineTop += lineHeight
      continue
    }

    const line = layoutNextLine(prepared, cursor, availableWidth)
    if (line === null) break

    lines.push({
      x: bestSlot.left,
      y: lineTop,
      text: line.text,
      width: line.width,
    })

    cursor = line.end
    lineTop += lineHeight
  }

  return lines
}

// --- Render ---
const FIXED_DT = 1 / 120
const MAX_SUBSTEPS = 4
let accumulator = 0
let lastTime = performance.now()

function frame(now: number) {
  const elapsed = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now
  accumulator += elapsed

  let steps = 0
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    for (const cb of cradleBalls) {
      if (cb.ball.mass !== Infinity && !cb.ball.sleeping) {
        cb.ball.force.y += cradleGravity * cb.ball.mass
      }
    }
    step(world, FIXED_DT)
    accumulator -= FIXED_DT
    steps++
  }

  ctx.clearRect(0, 0, W, H)

  // --- Reflow text around current ball positions ---
  const lines = layoutAroundBalls()

  // Draw text
  ctx.font = bodyFont
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#c8c4be'
  for (const line of lines) {
    ctx.fillText(line.text, line.x, line.y)
  }

  // --- Draw ropes ---
  for (const cb of cradleBalls) {
    ctx.strokeStyle = cb.color + '30'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cb.anchor.position.x, cb.anchor.position.y)
    ctx.lineTo(cb.ball.position.x, cb.ball.position.y)
    ctx.stroke()
  }

  // --- Draw balls ---
  for (const cb of cradleBalls) {
    const ball = cb.ball

    // Glow
    const gradient = ctx.createRadialGradient(
      ball.position.x, ball.position.y, 0,
      ball.position.x, ball.position.y, ballRadius + 4
    )
    gradient.addColorStop(0, cb.color + '33')
    gradient.addColorStop(1, 'transparent')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(ball.position.x, ball.position.y, ballRadius + 4, 0, Math.PI * 2)
    ctx.fill()

    // Ball
    ctx.fillStyle = cb.color + 'cc'
    ctx.beginPath()
    ctx.arc(ball.position.x, ball.position.y, ballRadius, 0, Math.PI * 2)
    ctx.fill()

    // Outline
    ctx.strokeStyle = cb.color
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(ball.position.x, ball.position.y, ballRadius, 0, Math.PI * 2)
    ctx.stroke()
  }

  // --- Anchor bar ---
  ctx.strokeStyle = '#2a2a35'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cradleStartX - 20, anchorY - 3)
  ctx.lineTo(cradleStartX + (ballCount - 1) * ballSpacing + 20, anchorY - 3)
  ctx.stroke()

  ctx.fillStyle = '#444'
  for (const cb of cradleBalls) {
    ctx.beginPath()
    ctx.arc(cb.anchor.position.x, cb.anchor.position.y, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // --- Caption ---
  ctx.font = 'italic 11px Georgia, "Times New Roman", serif'
  ctx.fillStyle = '#5a5660'
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'center'
  ctx.fillText('pretext layoutNextLine() reflows around physics bodies each frame · Drag any ball', W / 2, H - 10)

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
