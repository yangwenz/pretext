import { createWorld, createBody, createConnection, step } from '../../src/physics/index.js'
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

const world = createWorld({
  gravity: { x: 0, y: 600 },
  bounds: { x: 0, y: 0, width: W, height: H },
  iterations: 12,
  damping: 0.9995,
})

const font = 'bold 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
ctx.font = font

const anchorY = 80
const ropeLength = 250
const ballChars = ['C', 'L', 'I', 'C', 'K']
const ballColors = ['#ff6b6b', '#48dbfb', '#feca57', '#ff9ff3', '#54a0ff']
const spacing = 42
const startX = W / 2 - ((ballChars.length - 1) * spacing) / 2

type Pendulum = {
  anchor: Body
  ball: Body
  color: string
}

const pendulums: Pendulum[] = []

for (let i = 0; i < ballChars.length; i++) {
  const x = startX + i * spacing
  const char = ballChars[i]!
  const color = ballColors[i]!

  // Anchor (static)
  const anchor = createBody(world, '·', font, {
    position: { x, y: anchorY },
    mass: Infinity,
    width: 4,
    height: 4,
    collisionGroup: i + 1,
  })

  // Ball
  const ball = createBody(world, char, font, {
    position: { x, y: anchorY + ropeLength },
    mass: 5,
    width: 36,
    height: 36,
    restitution: 0.98,
    friction: 0.01,
    collisionGroup: 0,
  })

  // Rope constraint
  createConnection(world, {
    type: 'rope',
    a: anchor.id,
    b: ball.id,
    maxLength: ropeLength,
  })

  pendulums.push({ anchor, ball, color })
}

function pullLeft() {
  const p = pendulums[0]!
  p.ball.position.x -= 140
  p.ball.position.y -= 40
  p.ball.velocity.x = 0
  p.ball.velocity.y = 0
  p.ball.sleeping = false
  p.ball.sleepTimer = 0
}

function pullRight() {
  const p = pendulums[pendulums.length - 1]!
  p.ball.position.x += 140
  p.ball.position.y -= 40
  p.ball.velocity.x = 0
  p.ball.velocity.y = 0
  p.ball.sleeping = false
  p.ball.sleepTimer = 0
}

document.getElementById('btn-pull-left')!.addEventListener('click', pullLeft)
document.getElementById('btn-pull-right')!.addEventListener('click', pullRight)
document.getElementById('btn-pull-both')!.addEventListener('click', () => {
  pullLeft()
  pullRight()
})

// Start with left ball pulled
pullLeft()

// Drag interaction
let dragTarget: Pendulum | null = null
let dragOffsetX = 0
let dragOffsetY = 0

canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  for (const p of pendulums) {
    const dx = mx - p.ball.position.x
    const dy = my - p.ball.position.y
    if (dx * dx + dy * dy < 30 * 30) {
      dragTarget = p
      dragOffsetX = dx
      dragOffsetY = dy
      p.ball.mass = Infinity
      break
    }
  }
})

canvas.addEventListener('mousemove', (e) => {
  if (!dragTarget) return
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const targetX = mx - dragOffsetX
  const targetY = my - dragOffsetY
  // Constrain to rope length from anchor
  const dx = targetX - dragTarget.anchor.position.x
  const dy = targetY - dragTarget.anchor.position.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist > ropeLength) {
    dragTarget.ball.position.x = dragTarget.anchor.position.x + (dx / dist) * ropeLength
    dragTarget.ball.position.y = dragTarget.anchor.position.y + (dy / dist) * ropeLength
  } else {
    dragTarget.ball.position.x = targetX
    dragTarget.ball.position.y = targetY
  }
  dragTarget.ball.velocity.x = 0
  dragTarget.ball.velocity.y = 0
})

canvas.addEventListener('mouseup', () => {
  if (dragTarget) {
    dragTarget.ball.mass = 5
    dragTarget.ball.sleeping = false
    dragTarget.ball.sleepTimer = 0
    dragTarget = null
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

  // Draw frame
  ctx.strokeStyle = '#333'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(startX - 60, anchorY - 10)
  ctx.lineTo(startX + (ballChars.length - 1) * spacing + 60, anchorY - 10)
  ctx.stroke()

  // Draw ropes and balls
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (const p of pendulums) {
    // Rope
    ctx.strokeStyle = '#555'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(p.anchor.position.x, p.anchor.position.y)
    ctx.lineTo(p.ball.position.x, p.ball.position.y)
    ctx.stroke()

    // Ball glow
    const gradient = ctx.createRadialGradient(
      p.ball.position.x, p.ball.position.y, 0,
      p.ball.position.x, p.ball.position.y, 22
    )
    gradient.addColorStop(0, p.color + '33')
    gradient.addColorStop(1, 'transparent')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(p.ball.position.x, p.ball.position.y, 22, 0, Math.PI * 2)
    ctx.fill()

    // Ball circle
    ctx.strokeStyle = p.color + '88'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(p.ball.position.x, p.ball.position.y, 18, 0, Math.PI * 2)
    ctx.stroke()

    // Character
    ctx.font = font
    ctx.fillStyle = p.color
    ctx.fillText(p.ball.char, p.ball.position.x, p.ball.position.y)
  }

  // Anchor dots
  for (const p of pendulums) {
    ctx.fillStyle = '#666'
    ctx.beginPath()
    ctx.arc(p.anchor.position.x, p.anchor.position.y, 4, 0, Math.PI * 2)
    ctx.fill()
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
