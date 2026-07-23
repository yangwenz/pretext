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
  damping: 0.9998,
  sleepThresholdVel: 0.1,
  sleepDelay: 300,
})

const font = 'bold 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
ctx.font = font

const anchorY = 80
const ropeLength = 250
const ballChars = ['C', 'L', 'I', 'C', 'K']
const ballColors = ['#ff6b6b', '#48dbfb', '#feca57', '#ff9ff3', '#54a0ff']
const spacing = 42
const startX = W / 2 - ((ballChars.length - 1) * spacing) / 2
const ballRadius = 18

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

  const anchor = createBody(world, '·', font, {
    position: { x, y: anchorY },
    mass: Infinity,
    width: 4,
    height: 4,
    collisionGroup: i + 1,
  })

  const ball = createBody(world, char, font, {
    position: { x, y: anchorY + ropeLength },
    mass: 5,
    width: ballRadius * 2,
    height: ballRadius * 2,
    restitution: 0.99,
    friction: 0.0,
    collisionGroup: 0,
  })

  createConnection(world, {
    type: 'rigid',
    a: anchor.id,
    b: ball.id,
    length: ropeLength,
  })

  pendulums.push({ anchor, ball, color })
}

function pullLeft() {
  const p = pendulums[0]!
  const angle = -Math.PI / 4
  p.ball.position.x = p.anchor.position.x + Math.sin(angle) * ropeLength
  p.ball.position.y = p.anchor.position.y + Math.cos(angle) * ropeLength
  p.ball.velocity.x = 0
  p.ball.velocity.y = 0
  p.ball.sleeping = false
  p.ball.sleepTimer = 0
}

function pullRight() {
  const p = pendulums[pendulums.length - 1]!
  const angle = Math.PI / 4
  p.ball.position.x = p.anchor.position.x + Math.sin(angle) * ropeLength
  p.ball.position.y = p.anchor.position.y + Math.cos(angle) * ropeLength
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

pullLeft()

// Drag
let dragIdx = -1

canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  for (let i = 0; i < pendulums.length; i++) {
    const p = pendulums[i]!
    const dx = mx - p.ball.position.x
    const dy = my - p.ball.position.y
    if (dx * dx + dy * dy < 30 * 30) {
      dragIdx = i
      p.ball.mass = Infinity
      break
    }
  }
})

canvas.addEventListener('mousemove', (e) => {
  if (dragIdx < 0) return
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const p = pendulums[dragIdx]!
  const dx = mx - p.anchor.position.x
  const dy = my - p.anchor.position.y
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  p.ball.position.x = p.anchor.position.x + (dx / dist) * ropeLength
  p.ball.position.y = p.anchor.position.y + (dy / dist) * ropeLength
  p.ball.velocity.x = 0
  p.ball.velocity.y = 0
})

canvas.addEventListener('mouseup', () => {
  if (dragIdx >= 0) {
    const p = pendulums[dragIdx]!
    p.ball.mass = 5
    p.ball.sleeping = false
    p.ball.sleepTimer = 0
    dragIdx = -1
  }
})

const FIXED_DT = 1 / 240
const MAX_SUBSTEPS = 8
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

  // Frame bar with metallic gradient
  const barLeft = startX - 60
  const barRight = startX + (ballChars.length - 1) * spacing + 60
  const barGrad = ctx.createLinearGradient(barLeft, anchorY - 14, barLeft, anchorY - 6)
  barGrad.addColorStop(0, '#555')
  barGrad.addColorStop(0.5, '#888')
  barGrad.addColorStop(1, '#444')
  ctx.fillStyle = barGrad
  ctx.beginPath()
  ctx.roundRect(barLeft, anchorY - 14, barRight - barLeft, 8, 4)
  ctx.fill()

  // Draw ropes and balls
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (const p of pendulums) {
    // Rope with subtle gradient
    ctx.strokeStyle = '#444'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(p.anchor.position.x, p.anchor.position.y)
    ctx.lineTo(p.ball.position.x, p.ball.position.y)
    ctx.stroke()

    // Outer glow
    const glowGrad = ctx.createRadialGradient(
      p.ball.position.x, p.ball.position.y, ballRadius,
      p.ball.position.x, p.ball.position.y, ballRadius + 12
    )
    glowGrad.addColorStop(0, p.color + '22')
    glowGrad.addColorStop(1, 'transparent')
    ctx.fillStyle = glowGrad
    ctx.beginPath()
    ctx.arc(p.ball.position.x, p.ball.position.y, ballRadius + 12, 0, Math.PI * 2)
    ctx.fill()

    // Ball fill
    const ballGrad = ctx.createRadialGradient(
      p.ball.position.x - 4, p.ball.position.y - 4, 2,
      p.ball.position.x, p.ball.position.y, ballRadius
    )
    ballGrad.addColorStop(0, p.color + 'dd')
    ballGrad.addColorStop(1, p.color + '66')
    ctx.fillStyle = ballGrad
    ctx.beginPath()
    ctx.arc(p.ball.position.x, p.ball.position.y, ballRadius, 0, Math.PI * 2)
    ctx.fill()

    // Ball edge
    ctx.strokeStyle = p.color
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(p.ball.position.x, p.ball.position.y, ballRadius, 0, Math.PI * 2)
    ctx.stroke()

    // Character
    ctx.font = font
    ctx.fillStyle = '#fff'
    ctx.shadowColor = p.color
    ctx.shadowBlur = 4
    ctx.fillText(p.ball.char, p.ball.position.x, p.ball.position.y)
    ctx.shadowBlur = 0
  }

  // Anchor dots
  for (const p of pendulums) {
    ctx.fillStyle = '#888'
    ctx.beginPath()
    ctx.arc(p.anchor.position.x, p.anchor.position.y, 3.5, 0, Math.PI * 2)
    ctx.fill()
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
