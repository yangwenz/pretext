import { createWorld, createBody, step, applyInteraction } from '../../src/physics/index.js'
import { prepareWithSegments, layoutWithLines } from '../../src/layout.js'
import type { Body } from '../../src/physics/types.js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const dpr = window.devicePixelRatio || 1

const W = Math.min(800, window.innerWidth - 48)
const H = 500
canvas.width = W * dpr
canvas.height = H * dpr
canvas.style.width = `${W}px`
canvas.style.height = `${H}px`
ctx.scale(dpr, dpr)

const text = "Move your cursor through this text and watch the letters scatter away from it like magnetic particles. They always spring back to form readable text again."
const font = '20px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
const lineHeight = 28
const maxWidth = W - 80
const offsetX = 40
const offsetY = 80

const world = createWorld({
  gravity: { x: 0, y: 0 },
  bounds: { x: 0, y: 0, width: W, height: H },
  iterations: 2,
  damping: 0.92,
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
      restitution: 0.2,
      friction: 0.5,
    })
    bodies.push(body)
    restPositions.push({ x: x + charWidth / 2, y })
    x += charWidth
  }
}

let mouseX = -1000
let mouseY = -1000
let mouseInCanvas = false

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect()
  mouseX = e.clientX - rect.left
  mouseY = e.clientY - rect.top
  mouseInCanvas = true
})

canvas.addEventListener('mouseleave', () => {
  mouseInCanvas = false
})

const FIXED_DT = 1 / 120
const MAX_SUBSTEPS = 4
let accumulator = 0
let lastTime = performance.now()

function frame(now: number) {
  const elapsed = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now
  accumulator += elapsed

  // Apply spring forces toward rest positions
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i]!
    const rest = restPositions[i]!
    body.force.x += (rest.x - body.position.x) * 120
    body.force.y += (rest.y - body.position.y) * 120
    body.torque += -body.angle * 80
    body.sleeping = false
    body.sleepTimer = 0
  }

  // Apply repulsion from cursor
  if (mouseInCanvas) {
    applyInteraction(world, {
      type: 'repulsor',
      position: { x: mouseX, y: mouseY },
      strength: 25000,
      radius: 100,
    })
  }

  let steps = 0
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    step(world, FIXED_DT)
    accumulator -= FIXED_DT
    steps++
  }

  ctx.clearRect(0, 0, W, H)

  // Draw cursor field visualization
  if (mouseInCanvas) {
    // Outer aura
    const gradient = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, 100)
    gradient.addColorStop(0, 'rgba(108, 138, 255, 0.18)')
    gradient.addColorStop(0.4, 'rgba(108, 138, 255, 0.06)')
    gradient.addColorStop(1, 'rgba(108, 138, 255, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, W, H)

    // Pulsing ring
    const pulse = Math.sin(performance.now() / 400) * 0.3 + 0.7
    ctx.strokeStyle = `rgba(108, 138, 255, ${0.2 * pulse})`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(mouseX, mouseY, 50 + pulse * 10, 0, Math.PI * 2)
    ctx.stroke()

    // Center dot
    ctx.fillStyle = 'rgba(108, 138, 255, 0.6)'
    ctx.beginPath()
    ctx.arc(mouseX, mouseY, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // Render with distance-based color and subtle glow
  ctx.font = font
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i]!
    const rest = restPositions[i]!
    const dx = body.position.x - rest.x
    const dy = body.position.y - rest.y
    const displacement = Math.sqrt(dx * dx + dy * dy)
    const t = Math.min(1, displacement / 60)

    // Interpolate from white through accent blue to purple at max displacement
    const r = Math.round(232 + (108 - 232) * t)
    const g = Math.round(230 + (138 - 230) * t)
    const b = Math.round(227 + (255 - 227) * t)

    ctx.save()
    ctx.translate(body.position.x, body.position.y)
    ctx.rotate(body.angle)
    if (t > 0.3) {
      ctx.shadowColor = `rgb(${r},${g},${b})`
      ctx.shadowBlur = t * 8
    }
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillText(body.char, 0, 0)
    ctx.shadowBlur = 0
    ctx.restore()
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
