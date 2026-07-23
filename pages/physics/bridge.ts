import { createWorld, createBody, createConnection, step, applyInteraction } from '../../src/physics/index.js'
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

const world = createWorld({
  gravity: { x: 0, y: 600 },
  bounds: { x: 0, y: 0, width: W, height: H },
  iterations: 8,
  damping: 0.995,
})

const font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
ctx.font = font

const words = ["HELLO", "WORLD", "PHYSICS"]
const colors = ['#ff6b6b', '#48dbfb', '#feca57']
const bridges: Body[][] = []

const bridgeY = [140, 260, 380]
const margin = 60

for (let w = 0; w < words.length; w++) {
  const word = words[w]!
  const color = colors[w]!
  const graphemes = [...word]
  const y = bridgeY[w]!
  const spacing = (W - margin * 2) / (graphemes.length + 1)
  const bridgeBodies: Body[] = []

  for (let i = 0; i < graphemes.length; i++) {
    const char = graphemes[i]!
    const charWidth = ctx.measureText(char).width
    const x = margin + spacing * (i + 1)
    const isEndpoint = i === 0 || i === graphemes.length - 1
    const body = createBody(world, char, font, {
      position: { x, y },
      mass: isEndpoint ? Infinity : 1.5,
      width: charWidth,
      height: 30,
      restitution: 0.2,
      friction: 0.3,
    })
    ;(body as any)._color = color
    bridgeBodies.push(body)

    if (i > 0) {
      createConnection(world, {
        type: 'rigid',
        a: bridgeBodies[i - 1]!.id,
        b: body.id,
        length: spacing,
      })
    }
  }

  bridges.push(bridgeBodies)
}

// Drag interaction
let dragBodyId: number | null = null
let dragTarget = { x: 0, y: 0 }

canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top

  let closest: Body | null = null
  let closestDist = 40

  for (const body of world.bodies) {
    if (body.mass === Infinity || body.dead) continue
    const dx = body.position.x - mx
    const dy = body.position.y - my
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < closestDist) {
      closestDist = dist
      closest = body
    }
  }

  if (closest) {
    dragBodyId = closest.id
    dragTarget = { x: mx, y: my }
  }
})

canvas.addEventListener('mousemove', (e) => {
  if (dragBodyId === null) return
  const rect = canvas.getBoundingClientRect()
  dragTarget = { x: e.clientX - rect.left, y: e.clientY - rect.top }
})

canvas.addEventListener('mouseup', () => { dragBodyId = null })
canvas.addEventListener('mouseleave', () => { dragBodyId = null })

const FIXED_DT = 1 / 120
const MAX_SUBSTEPS = 4
let accumulator = 0
let lastTime = performance.now()

function frame(now: number) {
  const elapsed = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now
  accumulator += elapsed

  if (dragBodyId !== null) {
    applyInteraction(world, {
      type: 'drag',
      bodyId: dragBodyId,
      target: dragTarget,
      stiffness: 500,
    })
  }

  let steps = 0
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    step(world, FIXED_DT)
    accumulator -= FIXED_DT
    steps++
  }

  ctx.clearRect(0, 0, W, H)

  // Draw connection lines with gradient per bridge
  for (let w = 0; w < bridges.length; w++) {
    const bridgeBodies = bridges[w]!
    const color = colors[w]!
    ctx.strokeStyle = color + '30'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i < bridgeBodies.length; i++) {
      const b = bridgeBodies[i]!
      if (i === 0) ctx.moveTo(b.position.x, b.position.y)
      else ctx.lineTo(b.position.x, b.position.y)
    }
    ctx.stroke()
  }

  // Draw anchor points with glow
  for (const body of world.bodies) {
    if (body.mass === Infinity && !body.dead) {
      const glowGrad = ctx.createRadialGradient(body.position.x, body.position.y, 0, body.position.x, body.position.y, 12)
      glowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.2)')
      glowGrad.addColorStop(1, 'transparent')
      ctx.fillStyle = glowGrad
      ctx.beginPath()
      ctx.arc(body.position.x, body.position.y, 12, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.beginPath()
      ctx.arc(body.position.x, body.position.y, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Draw letters with subtle shadow
  ctx.font = font
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (const body of world.bodies) {
    if (body.dead || body.mass === Infinity) continue
    const color = (body as any)._color || '#e8e6e3'
    ctx.save()
    ctx.translate(body.position.x, body.position.y)
    ctx.rotate(body.angle)
    ctx.shadowColor = color
    ctx.shadowBlur = 4
    ctx.fillStyle = color
    ctx.fillText(body.char, 0, 0)
    ctx.shadowBlur = 0
    ctx.restore()
  }

  // Draw drag indicator
  if (dragBodyId !== null) {
    const body = world.bodies[dragBodyId]
    if (body) {
      ctx.strokeStyle = 'rgba(108, 138, 255, 0.6)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(body.position.x, body.position.y)
      ctx.lineTo(dragTarget.x, dragTarget.y)
      ctx.stroke()
      ctx.setLineDash([])

      // Target glow
      ctx.fillStyle = 'rgba(108, 138, 255, 0.3)'
      ctx.beginPath()
      ctx.arc(dragTarget.x, dragTarget.y, 6, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
