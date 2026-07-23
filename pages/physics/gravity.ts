import { createWorld, createBody, step, render } from '../../src/physics/index.js'
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

const text = "The quick brown fox jumps over the lazy dog. Every letter here is an independent physics body with mass, velocity, and collision."
const font = '22px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
const lineHeight = 30
const maxWidth = W - 80
const offsetX = 40
const offsetY = 60

const world = createWorld({
  gravity: { x: 0, y: 0 },
  bounds: { x: 0, y: 0, width: W, height: H },
  iterations: 4,
  damping: 0.99,
})

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

function splitGraphemes(s: string): string[] {
  return [...graphemeSegmenter.segment(s)].map(seg => seg.segment)
}

const prepared = prepareWithSegments(text, font)
const layout = layoutWithLines(prepared, maxWidth, lineHeight)

ctx.font = font
const bodies: Body[] = []
const restPositions: { x: number; y: number }[] = []

for (let lineIdx = 0; lineIdx < layout.lines.length; lineIdx++) {
  const line = layout.lines[lineIdx]!
  const graphemes = splitGraphemes(line.text)
  const y = offsetY + lineIdx * lineHeight + lineHeight / 2
  let x = offsetX

  for (const grapheme of graphemes) {
    const charWidth = ctx.measureText(grapheme).width
    const body = createBody(world, grapheme, font, {
      position: { x: x + charWidth / 2, y },
      mass: 1,
      width: charWidth,
      height: lineHeight * 0.85,
      restitution: 0.4,
      friction: 0.3,
    })
    bodies.push(body)
    restPositions.push({ x: x + charWidth / 2, y })
    x += charWidth
  }
}

let released = false

canvas.addEventListener('click', () => {
  if (!released) {
    world.config.gravity = { x: 0, y: 1200 }
    for (const body of bodies) {
      body.velocity.x = (Math.random() - 0.5) * 60
      body.velocity.y = (Math.random() - 0.5) * 30
      body.angularVelocity = (Math.random() - 0.5) * 3
      body.sleeping = false
      body.sleepTimer = 0
    }
    released = true
  } else {
    world.config.gravity = { x: 0, y: 0 }
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i]!
      const rest = restPositions[i]!
      body.position.x = rest.x
      body.position.y = rest.y
      body.velocity = { x: 0, y: 0 }
      body.angle = 0
      body.angularVelocity = 0
      body.sleeping = false
      body.sleepTimer = 0
    }
    released = false
  }
})

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
    step(world, FIXED_DT)
    accumulator -= FIXED_DT
    steps++
  }

  ctx.clearRect(0, 0, W, H)

  // Draw rest positions as faint guides when not released
  if (!released) {
    ctx.fillStyle = 'rgba(108, 138, 255, 0.15)'
    ctx.font = font
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i]!
      const rest = restPositions[i]!
      ctx.fillText(body.char, rest.x, rest.y + 6)
    }
  }

  ctx.fillStyle = '#e8e6e3'
  render(ctx, world)

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
