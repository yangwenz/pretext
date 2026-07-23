import { createWorld, createBody, createConnection, step, applyInteraction } from '../../src/physics/index.js'
import type { Body } from '../../src/physics/types.js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const dpr = window.devicePixelRatio || 1

const W = Math.min(900, window.innerWidth - 48)
const H = 600
canvas.width = W * dpr
canvas.height = H * dpr
canvas.style.width = `${W}px`
canvas.style.height = `${H}px`
ctx.scale(dpr, dpr)

const world = createWorld({
  gravity: { x: 0, y: 500 },
  bounds: { x: 0, y: 0, width: W, height: H },
  iterations: 8,
  damping: 0.993,
})

const font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
ctx.font = font

type ShapeObject = {
  bodies: Body[]
  color: string
  groupId: number
  kind: 'circle' | 'box' | 'triangle'
}

const shapes: ShapeObject[] = []
let groupCounter = 1

const palette = ['#ff6b6b', '#48dbfb', '#feca57', '#ff9ff3', '#54a0ff', '#01a3a4', '#f368e0', '#5f27cd', '#00d2d3', '#ee5a24']
let colorIdx = 0
function nextColor(): string {
  return palette[colorIdx++ % palette.length]!
}

const charPool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789*@#$%&!?+'
let charIdx = 0
function nextChar(): string {
  return charPool[charIdx++ % charPool.length]!
}

function measureChar(char: string): number {
  ctx.font = font
  return ctx.measureText(char).width
}

function createShapeObject(kind: 'circle' | 'box' | 'triangle', cx: number, cy: number, size: number): ShapeObject {
  const groupId = groupCounter++
  const color = nextColor()
  const bodies: Body[] = []
  const positions: { x: number; y: number }[] = []
  const charSize = 20

  if (kind === 'circle') {
    const radius = size
    const circumference = 2 * Math.PI * radius
    const count = Math.max(6, Math.round(circumference / charSize))
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      positions.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      })
    }
  } else if (kind === 'box') {
    const half = size
    const perSide = Math.max(3, Math.round((half * 2) / charSize))
    for (let i = 0; i < perSide; i++) {
      const t = -half + (i / perSide) * (half * 2)
      positions.push({ x: cx + t, y: cy - half }) // top
    }
    for (let i = 0; i < perSide; i++) {
      const t = -half + (i / perSide) * (half * 2)
      positions.push({ x: cx + half, y: cy + t }) // right
    }
    for (let i = 0; i < perSide; i++) {
      const t = half - (i / perSide) * (half * 2)
      positions.push({ x: cx + t, y: cy + half }) // bottom
    }
    for (let i = 0; i < perSide; i++) {
      const t = half - (i / perSide) * (half * 2)
      positions.push({ x: cx - half, y: cy + t }) // left
    }
  } else {
    const radius = size
    const sides = 3
    const perSide = Math.max(3, Math.round((radius * 2) / charSize))
    for (let s = 0; s < sides; s++) {
      const a1 = (s / sides) * Math.PI * 2 - Math.PI / 2
      const a2 = ((s + 1) / sides) * Math.PI * 2 - Math.PI / 2
      const x1 = cx + Math.cos(a1) * radius
      const y1 = cy + Math.sin(a1) * radius
      const x2 = cx + Math.cos(a2) * radius
      const y2 = cy + Math.sin(a2) * radius
      for (let i = 0; i < perSide; i++) {
        const t = i / perSide
        positions.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t })
      }
    }
  }

  for (const pos of positions) {
    const char = nextChar()
    const charWidth = measureChar(char)
    const body = createBody(world, char, font, {
      position: { x: pos.x, y: pos.y },
      velocity: { x: (Math.random() - 0.5) * 30, y: -50 + Math.random() * 30 },
      mass: 1.5,
      width: charWidth,
      height: 20,
      restitution: 0.4,
      friction: 0.4,
      collisionGroup: groupId,
    })
    bodies.push(body)
  }

  // Connect consecutive bodies with rigid constraints (outline)
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i]!
    const b = bodies[(i + 1) % bodies.length]!
    const dx = positions[(i + 1) % positions.length]!.x - positions[i]!.x
    const dy = positions[(i + 1) % positions.length]!.y - positions[i]!.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    createConnection(world, { type: 'rigid', a: a.id, b: b.id, length: dist })
  }

  // Cross-bracing for structural stability
  if (bodies.length >= 6) {
    const step = Math.floor(bodies.length / 3)
    for (let i = 0; i < bodies.length; i += step) {
      const j = (i + Math.floor(bodies.length / 2)) % bodies.length
      const a = bodies[i]!
      const b = bodies[j]!
      const dx = positions[j]!.x - positions[i]!.x
      const dy = positions[j]!.y - positions[i]!.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      createConnection(world, { type: 'rigid', a: a.id, b: b.id, length: dist })
    }
  }

  return { bodies, color, groupId, kind }
}

function dropShape(kind: 'circle' | 'box' | 'triangle') {
  const size = 30 + Math.random() * 25
  const x = 100 + Math.random() * (W - 200)
  const y = -size
  shapes.push(createShapeObject(kind, x, y, size))
}

// Initial shapes
shapes.push(createShapeObject('circle', W * 0.25, 80, 40))
shapes.push(createShapeObject('box', W * 0.5, 60, 35))
shapes.push(createShapeObject('triangle', W * 0.75, 90, 45))

// Buttons
document.getElementById('btn-circle')!.addEventListener('click', () => dropShape('circle'))
document.getElementById('btn-box')!.addEventListener('click', () => dropShape('box'))
document.getElementById('btn-triangle')!.addEventListener('click', () => dropShape('triangle'))
document.getElementById('btn-reset')!.addEventListener('click', () => {
  for (const shape of shapes) {
    for (const body of shape.bodies) {
      body.dead = true
    }
  }
  shapes.length = 0
  groupCounter = 1
  shapes.push(createShapeObject('circle', W * 0.25, 80, 40))
  shapes.push(createShapeObject('box', W * 0.5, 60, 35))
  shapes.push(createShapeObject('triangle', W * 0.75, 90, 45))
})

// Drag interaction
let dragging = false
let dragX = 0
let dragY = 0

canvas.addEventListener('mousedown', (e) => {
  dragging = true
  const rect = canvas.getBoundingClientRect()
  dragX = e.clientX - rect.left
  dragY = e.clientY - rect.top
})

canvas.addEventListener('mousemove', (e) => {
  if (!dragging) return
  const rect = canvas.getBoundingClientRect()
  dragX = e.clientX - rect.left
  dragY = e.clientY - rect.top
})

canvas.addEventListener('mouseup', () => {
  if (dragging) {
    applyInteraction(world, {
      type: 'impulse',
      position: { x: dragX, y: dragY },
      radius: 120,
      strength: 800,
    })
  }
  dragging = false
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

  // Draw shape outlines
  ctx.lineWidth = 1.5
  for (const shape of shapes) {
    ctx.strokeStyle = shape.color + '44'
    ctx.beginPath()
    for (let i = 0; i < shape.bodies.length; i++) {
      const b = shape.bodies[i]!
      if (b.dead) continue
      if (i === 0) ctx.moveTo(b.position.x, b.position.y)
      else ctx.lineTo(b.position.x, b.position.y)
    }
    ctx.closePath()
    ctx.stroke()
  }

  // Draw characters
  ctx.font = font
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (const shape of shapes) {
    ctx.fillStyle = shape.color
    for (const body of shape.bodies) {
      if (body.dead) continue
      ctx.save()
      ctx.translate(body.position.x, body.position.y)
      ctx.rotate(body.angle)
      ctx.fillText(body.char, 0, 0)
      ctx.restore()
    }
  }

  // Draw drag indicator
  if (dragging) {
    ctx.beginPath()
    ctx.arc(dragX, dragY, 120, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(108, 138, 255, 0.3)'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
