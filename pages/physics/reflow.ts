import { prepareWithSegments, layoutWithLines } from '../../src/layout.js'
import { createWorld, createBody, createConnection, step, applyInteraction } from '../../src/physics/index.js'
import type { Body } from '../../src/physics/types.js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const dpr = window.devicePixelRatio || 1

const W = Math.min(900, window.innerWidth - 48)
const H = 500
canvas.width = W * dpr
canvas.height = H * dpr
canvas.style.width = `${W}px`
canvas.style.height = `${H}px`
ctx.scale(dpr, dpr)

const textContent = `The quick brown fox jumps over the lazy dog. Typography is the art and technique of arranging type to make written language legible, readable, and appealing when displayed. Physics gives text a playful life of its own.`

const font = '18px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
const lineHeight = 28
const paddingX = 24
const paddingY = 24

const prepared = prepareWithSegments(textContent, font)

// State
let maxWidth = 500
let mode: 'layout' | 'physics' = 'layout'

// --- Pretext layout rendering ---

type CharPos = { char: string; x: number; y: number; width: number }

function computeLayout(mw: number): CharPos[] {
  const result = layoutWithLines(prepared, mw - paddingX * 2, lineHeight)
  const positions: CharPos[] = []

  ctx.font = font
  for (let lineIdx = 0; lineIdx < result.lines.length; lineIdx++) {
    const line = result.lines[lineIdx]!
    const y = paddingY + lineIdx * lineHeight + lineHeight / 2
    let x = paddingX
    const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(line.text)].map(s => s.segment)
    for (const g of graphemes) {
      const w = ctx.measureText(g).width
      positions.push({ char: g, x: x + w / 2, y, width: w })
      x += w
    }
  }
  return positions
}

function drawLayout(positions: CharPos[]) {
  ctx.clearRect(0, 0, W, H)

  // Draw container with corner accents
  const cx = paddingX - 4
  const cy = paddingY - 4
  const cw = maxWidth - paddingX * 2 + 8
  const ch = H - paddingY * 2 + 8
  ctx.strokeStyle = '#1e1e2e'
  ctx.lineWidth = 1
  ctx.strokeRect(cx, cy, cw, ch)

  // Corner accents
  const cornerLen = 12
  ctx.strokeStyle = 'rgba(108, 138, 255, 0.3)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, cy + cornerLen); ctx.lineTo(cx, cy); ctx.lineTo(cx + cornerLen, cy)
  ctx.moveTo(cx + cw - cornerLen, cy); ctx.lineTo(cx + cw, cy); ctx.lineTo(cx + cw, cy + cornerLen)
  ctx.moveTo(cx + cw, cy + ch - cornerLen); ctx.lineTo(cx + cw, cy + ch); ctx.lineTo(cx + cw - cornerLen, cy + ch)
  ctx.moveTo(cx + cornerLen, cy + ch); ctx.lineTo(cx, cy + ch); ctx.lineTo(cx, cy + ch - cornerLen)
  ctx.stroke()

  // Draw text
  ctx.font = font
  ctx.fillStyle = '#e8e6e3'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (const p of positions) {
    ctx.fillText(p.char, p.x, p.y)
  }
}

// --- Physics mode ---

let world = createWorld({
  gravity: { x: 0, y: 400 },
  bounds: { x: 0, y: 0, width: W, height: H },
  iterations: 6,
  damping: 0.995,
  sleepThresholdVel: 0.3,
  sleepDelay: 120,
})

let bodies: Body[] = []
let targetPositions: CharPos[] = []
let assembling = false

function shatter() {
  const positions = computeLayout(maxWidth)
  // Reset world
  world = createWorld({
    gravity: { x: 0, y: 400 },
    bounds: { x: 0, y: 0, width: W, height: H },
    iterations: 6,
    damping: 0.995,
    sleepThresholdVel: 0.3,
    sleepDelay: 120,
  })
  bodies = []
  targetPositions = positions
  assembling = false

  for (const p of positions) {
    const body = createBody(world, p.char, font, {
      position: { x: p.x, y: p.y },
      velocity: {
        x: (Math.random() - 0.5) * 600,
        y: -200 - Math.random() * 400,
      },
      mass: 1,
      width: p.width,
      height: 20,
      restitution: 0.5,
      friction: 0.3,
      collisionGroup: 0,
    })
    body.angularVelocity = (Math.random() - 0.5) * 10
    bodies.push(body)
  }
  mode = 'physics'
  updateUI()
}

function assemble() {
  assembling = true
  // Recompute target positions with current width
  targetPositions = computeLayout(maxWidth)

  // Remove gravity and add springs to targets
  world.config.gravity = { x: 0, y: 0 }

  // Clear existing connections
  world.connections.length = 0

  for (let i = 0; i < bodies.length && i < targetPositions.length; i++) {
    const body = bodies[i]!
    const target = targetPositions[i]!
    body.sleeping = false
    body.sleepTimer = 0
    // Create an invisible anchor at the target
    const anchor = createBody(world, '', font, {
      position: { x: target.x, y: target.y },
      mass: Infinity,
      width: 1,
      height: 1,
      collisionGroup: 99999,
    })
    createConnection(world, {
      type: 'spring',
      a: anchor.id,
      b: body.id,
      stiffness: 200,
      damping: 20,
      restLength: 0,
    })
  }
  updateUI()
}

function backToLayout() {
  mode = 'layout'
  assembling = false
  bodies = []
  world.bodies.length = 0
  world.connections.length = 0
  updateUI()
}

function updateUI() {
  const btn = document.getElementById('btn-toggle')!
  const label = document.getElementById('mode-label')!
  if (mode === 'layout') {
    btn.textContent = 'Shatter'
    label.textContent = 'Layout mode'
  } else if (!assembling) {
    btn.textContent = 'Reassemble'
    label.textContent = 'Physics mode'
  } else {
    btn.textContent = 'Back to Layout'
    label.textContent = 'Assembling...'
  }
}

// --- Controls ---

const slider = document.getElementById('width-slider') as HTMLInputElement
const widthLabel = document.getElementById('width-label')!

slider.addEventListener('input', () => {
  maxWidth = parseInt(slider.value)
  widthLabel.textContent = `${maxWidth}px`
  if (assembling && targetPositions.length > 0) {
    // Live-update anchor targets on resize during assembly
    targetPositions = computeLayout(maxWidth)
    let anchorIdx = bodies.length
    for (let i = 0; i < bodies.length && i < targetPositions.length; i++) {
      const target = targetPositions[i]!
      const anchor = world.bodies[anchorIdx]
      if (anchor) {
        anchor.position.x = target.x
        anchor.position.y = target.y
      }
      anchorIdx++
    }
    // Wake all bodies
    for (const body of bodies) {
      body.sleeping = false
      body.sleepTimer = 0
    }
  }
})

document.getElementById('btn-toggle')!.addEventListener('click', () => {
  if (mode === 'layout') {
    shatter()
  } else if (!assembling) {
    assemble()
  } else {
    backToLayout()
  }
})

canvas.addEventListener('click', (e) => {
  if (mode === 'physics' && !assembling) {
    const rect = canvas.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top
    applyInteraction(world, {
      type: 'impulse',
      position: { x: clickX, y: clickY },
      radius: 150,
      strength: 500,
    })
    for (const body of bodies) {
      body.sleeping = false
      body.sleepTimer = 0
    }
  }
})

// --- Render loop ---

const FIXED_DT = 1 / 120
const MAX_SUBSTEPS = 4
let accumulator = 0
let lastTime = performance.now()

function frame(now: number) {
  const elapsed = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now

  if (mode === 'layout') {
    const positions = computeLayout(maxWidth)
    drawLayout(positions)
  } else {
    accumulator += elapsed
    let steps = 0
    while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
      step(world, FIXED_DT)
      accumulator -= FIXED_DT
      steps++
    }

    ctx.clearRect(0, 0, W, H)

    // Draw container outline
    ctx.strokeStyle = '#2a2a35'
    ctx.lineWidth = 1
    ctx.strokeRect(paddingX - 4, paddingY - 4, maxWidth - paddingX * 2 + 8, H - paddingY * 2 + 8)

    // Draw ghost text (target positions) when assembling
    if (assembling) {
      ctx.font = font
      ctx.fillStyle = 'rgba(108, 138, 255, 0.15)'
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      for (const p of targetPositions) {
        ctx.fillText(p.char, p.x, p.y)
      }
    }

    // Draw physics bodies
    ctx.font = font
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    for (const body of bodies) {
      if (body.dead) continue
      const alpha = assembling ? 1.0 : Math.min(1, 0.7 + Math.abs(body.velocity.x + body.velocity.y) * 0.001)
      ctx.fillStyle = assembling ? '#e8e6e3' : `rgba(232, 230, 227, ${alpha})`
      ctx.save()
      ctx.translate(body.position.x, body.position.y)
      ctx.rotate(body.angle)
      ctx.fillText(body.char, 0, 0)
      ctx.restore()
    }

    // Check if assembly is complete (all bodies near targets and slow)
    if (assembling) {
      let settled = true
      for (let i = 0; i < bodies.length && i < targetPositions.length; i++) {
        const body = bodies[i]!
        const target = targetPositions[i]!
        const dx = body.position.x - target.x
        const dy = body.position.y - target.y
        const speed = body.velocity.x * body.velocity.x + body.velocity.y * body.velocity.y
        if (dx * dx + dy * dy > 1 || speed > 0.5) {
          settled = false
          break
        }
      }
      if (settled) {
        backToLayout()
      }
    }
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
updateUI()
