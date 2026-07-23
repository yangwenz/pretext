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
const cradleWordFont = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
const lineHeight = 26
const marginX = 50
const fullWidth = W - marginX * 2
const textStartY = 50

// --- Document text prepared by pretext ---
const documentText = `In classical mechanics, momentum is the product of mass and velocity. Newton's third law implies that the total momentum of a closed system remains constant. This principle is beautifully demonstrated by the apparatus you see here — word-balls swing on pendulums embedded within this paragraph. As they move, the text reflows around them in real time. Each line is laid out by pretext's layoutNextLine API with a width that accounts for the current ball positions. When a ball swings into a line's band, that line gets shorter to make room. The text wraps naturally around the obstacle, just as CSS would flow text around a float — except here the float is animated by a physics engine. Drag any colored word to disturb it. Watch how the surrounding paragraph reshapes itself every frame to accommodate the motion. This is the real integration: pretext handles line-breaking and text shaping, the physics engine handles forces and collisions, and they communicate through obstacle geometry each frame.`

const prepared = prepareWithSegments(documentText, bodyFont)

// --- Cradle words (physics balls) measured by pretext ---
const cradleWords = ['force', 'mass', 'speed']
const cradleColors = ['#ff6b6b', '#48dbfb', '#feca57']

ctx.font = cradleWordFont
const wordWidths = cradleWords.map(w => ctx.measureText(w).width)

// --- Physics world ---
const world = createWorld({
  gravity: { x: 0, y: 0 },
  bounds: { x: marginX, y: 0, width: fullWidth, height: H },
  iterations: 8,
  damping: 0.995,
  sleepThresholdVel: 0.1,
  sleepDelay: 200,
})

// Cradle: balls rest in the middle of the text area
const ropeLength = 150
const anchorY = textStartY - 30
const cradleGravity = 400
const ballSpacing = 160
const cradleCenterX = W / 2

type CradleBall = {
  anchor: Body
  ball: Body
  word: string
  width: number
  color: string
}

const cradleBalls: CradleBall[] = []
const cradleStartX = cradleCenterX - ((cradleWords.length - 1) * ballSpacing) / 2

for (let i = 0; i < cradleWords.length; i++) {
  const word = cradleWords[i]!
  const color = cradleColors[i]!
  const ww = wordWidths[i]!
  const x = cradleStartX + i * ballSpacing

  const anchor = createBody(world, '·', cradleWordFont, {
    position: { x, y: anchorY },
    mass: Infinity,
    width: 4,
    height: 4,
    collisionGroup: 999,
  })

  const ball = createBody(world, word, cradleWordFont, {
    position: { x, y: anchorY + ropeLength },
    mass: 5,
    width: ww + 20,
    height: lineHeight + 8,
    restitution: 0.9,
    friction: 0.0,
    collisionGroup: 0,
  })

  createConnection(world, {
    type: 'rigid',
    a: anchor.id,
    b: ball.id,
    length: ropeLength,
  })

  cradleBalls.push({ anchor, ball, word, width: ww, color })
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
    if (Math.abs(dx) < ball.width / 2 + 6 && Math.abs(dy) < ball.height / 2 + 6) {
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
      const ballTop = cb.ball.position.y - cb.ball.height / 2
      const ballBottom = cb.ball.position.y + cb.ball.height / 2
      if (ballBottom > bandTop && ballTop < bandBottom) {
        const halfW = cb.ball.width / 2
        blocked.push({
          left: cb.ball.position.x - halfW,
          right: cb.ball.position.x + halfW,
        })
      }
    }

    // Sort blocked intervals and merge overlaps
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

    // Carve available slots from the full line width
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
      // Line fully blocked, skip
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
      // Too narrow to fit text
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
    ctx.strokeStyle = cb.color + '35'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(cb.anchor.position.x, cb.anchor.position.y)
    ctx.lineTo(cb.ball.position.x, cb.ball.position.y)
    ctx.stroke()
  }

  // --- Draw word-balls ---
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (const cb of cradleBalls) {
    const ball = cb.ball
    ctx.save()
    ctx.translate(ball.position.x, ball.position.y)
    ctx.rotate(ball.angle)

    const pw = cb.width + 16
    const ph = lineHeight + 4
    ctx.shadowColor = cb.color + '44'
    ctx.shadowBlur = 10
    ctx.fillStyle = '#0e0e16'
    ctx.strokeStyle = cb.color + '88'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2)
    ctx.fill()
    ctx.stroke()
    ctx.shadowBlur = 0

    ctx.font = cradleWordFont
    ctx.fillStyle = cb.color
    ctx.fillText(cb.word, 0, 0)
    ctx.restore()
  }

  // --- Anchor bar ---
  ctx.strokeStyle = '#2a2a35'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cradleStartX - 30, anchorY - 3)
  ctx.lineTo(cradleStartX + (cradleWords.length - 1) * ballSpacing + 30, anchorY - 3)
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
  ctx.fillText('pretext layoutNextLine() reflows around physics bodies each frame · Drag any word-ball', W / 2, H - 10)

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
