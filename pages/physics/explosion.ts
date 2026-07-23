import { createWorld, createBody, step, applyInteraction } from '../../src/physics/index.js'
import { prepareWithSegments, layoutWithLines } from '../../src/layout.js'
import type { Body } from '../../src/physics/types.js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const dpr = window.devicePixelRatio || 1

const W = Math.min(800, window.innerWidth - 48)
const H = 600
canvas.width = W * dpr
canvas.height = H * dpr
canvas.style.width = `${W}px`
canvas.style.height = `${H}px`
ctx.scale(dpr, dpr)

const text = "SHATTER ME"
const font = 'bold 64px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
const lineHeight = 76

const world = createWorld({
  gravity: { x: 0, y: 0 },
  bounds: { x: 0, y: 0, width: W, height: H },
  iterations: 3,
  damping: 0.985,
})

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
function splitGraphemes(s: string): string[] {
  return [...graphemeSegmenter.segment(s)].map(seg => seg.segment)
}

const prepared = prepareWithSegments(text, font)
const layout = layoutWithLines(prepared, W - 60, lineHeight)

ctx.font = font
const bodies: Body[] = []
const restPositions: { x: number; y: number }[] = []

// Center the text
const startY = H / 2 - (layout.lines.length * lineHeight) / 2

for (let lineIdx = 0; lineIdx < layout.lines.length; lineIdx++) {
  const line = layout.lines[lineIdx]!
  const graphemes = splitGraphemes(line.text)
  const lineWidth = ctx.measureText(line.text).width
  let x = (W - lineWidth) / 2
  const y = startY + lineIdx * lineHeight + lineHeight / 2

  for (const grapheme of graphemes) {
    const charWidth = ctx.measureText(grapheme).width
    const body = createBody(world, grapheme, font, {
      position: { x: x + charWidth / 2, y },
      mass: 1,
      width: charWidth,
      height: lineHeight * 0.8,
      restitution: 0.6,
      friction: 0.2,
    })
    bodies.push(body)
    restPositions.push({ x: x + charWidth / 2, y })
    x += charWidth
  }
}

let shattered = false
let springStrength = 0

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect()
  const clickX = e.clientX - rect.left
  const clickY = e.clientY - rect.top

  if (!shattered) {
    world.config.gravity = { x: 0, y: 400 }
    applyInteraction(world, {
      type: 'impulse',
      position: { x: clickX, y: clickY },
      radius: 500,
      strength: 800,
    })
    for (const body of bodies) {
      body.angularVelocity += (Math.random() - 0.5) * 15
      body.sleeping = false
      body.sleepTimer = 0
    }
    shattered = true
    springStrength = 0
  } else {
    world.config.gravity = { x: 0, y: 0 }
    springStrength = 200
    shattered = false
  }
})

const FIXED_DT = 1 / 120
const MAX_SUBSTEPS = 4
let accumulator = 0
let lastTime = performance.now()

const colors = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#01a3a4', '#f368e0']

function frame(now: number) {
  const elapsed = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now
  accumulator += elapsed

  // Apply spring-back forces toward rest positions
  if (springStrength > 0) {
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i]!
      const rest = restPositions[i]!
      body.force.x += (rest.x - body.position.x) * springStrength
      body.force.y += (rest.y - body.position.y) * springStrength
      // Angular return
      body.torque += -body.angle * springStrength * 0.5
      body.sleeping = false
      body.sleepTimer = 0
    }
  }

  let steps = 0
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    step(world, FIXED_DT)
    accumulator -= FIXED_DT
    steps++
  }

  ctx.clearRect(0, 0, W, H)

  // Custom render with colors
  ctx.font = font
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i]!
    if (body.dead) continue
    ctx.save()
    ctx.translate(body.position.x, body.position.y)
    ctx.rotate(body.angle)
    ctx.fillStyle = colors[i % colors.length]!
    ctx.fillText(body.char, 0, 0)
    ctx.restore()
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
