import { prepareWithSegments, layoutWithLines } from '../../src/layout.js'
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
const lineHeight = 28
const marginX = 50
const contentWidth = W - marginX * 2

// --- The paragraph. Certain words become cradle balls. ---
// We mark physics words with [brackets] in source, then strip them for pretext layout
// but track their positions after layout.
const rawText = `In classical mechanics, [force] equals [mass] times acceleration. An object's [speed] determines its kinetic [energy], and the total [momentum] of a closed system is always conserved. Newton's cradle demonstrates this beautifully — each collision transfers impulse through the chain with near-perfect efficiency.`

const physicsWords = ['force', 'mass', 'speed', 'energy', 'momentum']
const cradleColors = ['#ff6b6b', '#48dbfb', '#feca57', '#ff9ff3', '#54a0ff']

// Strip brackets for pretext layout
const cleanText = rawText.replace(/\[(\w+)\]/g, '$1')

// --- Lay out the full paragraph with pretext ---
const prepared = prepareWithSegments(cleanText, bodyFont)
const layoutResult = layoutWithLines(prepared, contentWidth, lineHeight)

// --- Find the pixel positions of each physics word in the laid-out text ---
type WordSlot = {
  word: string
  x: number  // center x
  y: number  // center y
  width: number
  lineIdx: number
  color: string
}

const wordSlots: WordSlot[] = []

ctx.font = bodyFont
const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })

// Walk the laid-out lines to find each physics word's position
let globalCharIdx = 0
const textStartY = 60

for (let lineIdx = 0; lineIdx < layoutResult.lines.length; lineIdx++) {
  const line = layoutResult.lines[lineIdx]!
  const y = textStartY + lineIdx * lineHeight
  let x = marginX

  // Walk character by character to find word boundaries
  const words = [...segmenter.segment(line.text)]
  for (const seg of words) {
    const w = ctx.measureText(seg.segment).width
    const physIdx = physicsWords.indexOf(seg.segment)
    if (physIdx !== -1 && wordSlots.length <= physIdx) {
      wordSlots.push({
        word: seg.segment,
        x: x + w / 2,
        y: y + lineHeight / 2,
        width: w,
        lineIdx,
        color: cradleColors[physIdx]!,
      })
    }
    x += w
  }
  globalCharIdx += line.text.length
}

// --- Physics world ---
const world = createWorld({
  gravity: { x: 0, y: 0 },
  bounds: { x: 0, y: 0, width: W, height: H },
  iterations: 8,
  damping: 0.985,
  sleepThresholdVel: 0.2,
  sleepDelay: 100,
})

// --- Each physics word becomes a pendulum ball ---
// Anchor is directly above the word's paragraph position
const ropeLength = 100
const cradleGravity = 500

type CradleBall = {
  anchor: Body
  ball: Body
  slot: WordSlot
}

const cradleBalls: CradleBall[] = []

for (const slot of wordSlots) {
  const anchor = createBody(world, '·', bodyFont, {
    position: { x: slot.x, y: slot.y - ropeLength },
    mass: Infinity,
    width: 4,
    height: 4,
    collisionGroup: 999,
  })

  const ball = createBody(world, slot.word, bodyFont, {
    position: { x: slot.x, y: slot.y },
    mass: 5,
    width: slot.width + 8,
    height: lineHeight,
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

  cradleBalls.push({ anchor, ball, slot })
}

// Pull leftmost ball
const leftBall = cradleBalls[0]!
const pullAngle = -Math.PI / 4
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
    if (Math.abs(dx) < ball.width / 2 + 6 && Math.abs(dy) < lineHeight) {
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
    const cb = cradleBalls[dragIdx]!
    cb.ball.mass = 5
    cb.ball.sleeping = false
    cb.ball.sleepTimer = 0
    dragIdx = -1
  }
}

canvas.addEventListener('mouseup', releaseDrag)
canvas.addEventListener('mouseleave', releaseDrag)

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

  // --- Draw the paragraph (static text), leaving blanks where physics words go ---
  ctx.font = bodyFont
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#c8c4be'

  for (let lineIdx = 0; lineIdx < layoutResult.lines.length; lineIdx++) {
    const line = layoutResult.lines[lineIdx]!
    const y = textStartY + lineIdx * lineHeight + lineHeight / 2
    let x = marginX

    const words = [...segmenter.segment(line.text)]
    for (const seg of words) {
      const w = ctx.measureText(seg.segment).width
      const isPhysicsWord = wordSlots.some(s => s.word === seg.segment && s.lineIdx === lineIdx)

      if (!isPhysicsWord) {
        ctx.fillStyle = '#c8c4be'
        ctx.fillText(seg.segment, x, y)
      }
      // Leave blank gap for physics words — they're rendered by the physics system
      x += w
    }
  }

  // --- Draw ropes (subtle) ---
  for (const cb of cradleBalls) {
    ctx.strokeStyle = cb.slot.color + '30'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cb.anchor.position.x, cb.anchor.position.y)
    ctx.lineTo(cb.ball.position.x, cb.ball.position.y)
    ctx.stroke()
  }

  // --- Draw physics word-balls ---
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (const cb of cradleBalls) {
    const ball = cb.ball
    ctx.save()
    ctx.translate(ball.position.x, ball.position.y)
    ctx.rotate(ball.angle)

    // Highlight background
    const pw = cb.slot.width + 10
    const ph = lineHeight - 4
    ctx.fillStyle = cb.slot.color + '18'
    ctx.strokeStyle = cb.slot.color + '55'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(-pw / 2, -ph / 2, pw, ph, 4)
    ctx.fill()
    ctx.stroke()

    // Word
    ctx.font = bodyFont
    ctx.fillStyle = cb.slot.color
    ctx.fillText(cb.slot.word, 0, 0)
    ctx.restore()
  }

  // --- Caption ---
  ctx.font = 'italic 12px Georgia, "Times New Roman", serif'
  ctx.fillStyle = '#5a5660'
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'center'
  ctx.fillText('Colored words are positioned by pretext layout, animated by physics · Drag any highlighted word', W / 2, H - 14)

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
