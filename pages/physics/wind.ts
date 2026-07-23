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

const text = "The wind whispers through these letters, bending them like grass in a field. Each character fights to hold its place against the invisible force."
const font = '22px Georgia, "Times New Roman", serif'
const lineHeight = 32
const maxWidth = W - 100
const offsetX = 50
const offsetY = 80

const world = createWorld({
  gravity: { x: 0, y: 80 },
  bounds: { x: -50, y: -50, width: W + 100, height: H + 100 },
  iterations: 2,
  damping: 0.96,
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
      mass: 0.8 + Math.random() * 0.4,
      width: charWidth,
      height: lineHeight * 0.8,
      restitution: 0.1,
      friction: 0.5,
    })
    bodies.push(body)
    restPositions.push({ x: x + charWidth / 2, y })
    x += charWidth
  }
}

// Wind settings
type WindLevel = 'calm' | 'breeze' | 'gale' | 'storm'
let windLevel: WindLevel = 'breeze'
const windSettings: Record<WindLevel, { base: number; gust: number; spring: number }> = {
  calm: { base: 0, gust: 0, spring: 150 },
  breeze: { base: 120, gust: 80, spring: 120 },
  gale: { base: 350, gust: 200, spring: 90 },
  storm: { base: 700, gust: 500, spring: 60 },
}

// Button controls
const buttons = {
  calm: document.getElementById('btn-calm') as HTMLButtonElement,
  breeze: document.getElementById('btn-breeze') as HTMLButtonElement,
  gale: document.getElementById('btn-gale') as HTMLButtonElement,
  storm: document.getElementById('btn-storm') as HTMLButtonElement,
}

function setWindLevel(level: WindLevel) {
  windLevel = level
  for (const [key, btn] of Object.entries(buttons)) {
    btn.classList.toggle('active', key === level)
  }
}

buttons.calm.addEventListener('click', () => setWindLevel('calm'))
buttons.breeze.addEventListener('click', () => setWindLevel('breeze'))
buttons.gale.addEventListener('click', () => setWindLevel('gale'))
buttons.storm.addEventListener('click', () => setWindLevel('storm'))

const FIXED_DT = 1 / 120
const MAX_SUBSTEPS = 4
let accumulator = 0
let lastTime = performance.now()
let time = 0

function frame(now: number) {
  const elapsed = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now
  accumulator += elapsed
  time += elapsed

  const settings = windSettings[windLevel]

  // Apply spring return forces
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i]!
    const rest = restPositions[i]!
    body.force.x += (rest.x - body.position.x) * settings.spring
    body.force.y += (rest.y - body.position.y) * settings.spring
    body.torque += -body.angle * settings.spring * 0.3
    body.sleeping = false
    body.sleepTimer = 0
  }

  // Apply wind with gusting
  if (settings.base > 0) {
    const gust = Math.sin(time * 1.7) * 0.5 + Math.sin(time * 3.1) * 0.3 + Math.sin(time * 0.4) * 0.2
    const windStrength = settings.base + settings.gust * gust
    applyInteraction(world, {
      type: 'wind',
      direction: { x: 1, y: Math.sin(time * 2.3) * 0.15 },
      strength: windStrength,
    })
  }

  let steps = 0
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    step(world, FIXED_DT)
    accumulator -= FIXED_DT
    steps++
  }

  ctx.clearRect(0, 0, W, H)

  // Draw wind lines (visual effect)
  if (settings.base > 0) {
    const intensity = settings.base / 700
    ctx.strokeStyle = `rgba(108, 138, 255, ${0.05 + intensity * 0.08})`
    ctx.lineWidth = 1
    for (let i = 0; i < 8 + intensity * 12; i++) {
      const phase = time * (1.5 + i * 0.3) + i * 47
      const yPos = 30 + (i * 53) % (H - 60)
      const xStart = ((phase * 80) % (W + 200)) - 100
      const length = 40 + intensity * 60
      ctx.beginPath()
      ctx.moveTo(xStart, yPos)
      ctx.lineTo(xStart + length, yPos + Math.sin(phase) * 3)
      ctx.stroke()
    }
  }

  // Render letters with displacement-based opacity
  ctx.font = font
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i]!
    const rest = restPositions[i]!
    const dx = body.position.x - rest.x
    const dy = body.position.y - rest.y
    const displacement = Math.sqrt(dx * dx + dy * dy)
    const alpha = Math.max(0.4, 1 - displacement / 150)

    ctx.save()
    ctx.translate(body.position.x, body.position.y)
    ctx.rotate(body.angle)
    ctx.fillStyle = `rgba(232, 230, 227, ${alpha})`
    ctx.fillText(body.char, 0, 0)
    ctx.restore()
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
