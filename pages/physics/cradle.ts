
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

const font = 'bold 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
ctx.font = font

const anchorY = 80
const ropeLength = 250
const ballChars = ['C', 'L', 'I', 'C', 'K']
const ballColors = ['#ff6b6b', '#48dbfb', '#feca57', '#ff9ff3', '#54a0ff']
const spacing = 42
const startX = W / 2 - ((ballChars.length - 1) * spacing) / 2
const gravity = 600
const ballRadius = 18

type Pendulum = {
  anchorX: number
  angle: number
  angularVel: number
  color: string
  char: string
}

const pendulums: Pendulum[] = []

for (let i = 0; i < ballChars.length; i++) {
  pendulums.push({
    anchorX: startX + i * spacing,
    angle: 0,
    angularVel: 0,
    color: ballColors[i]!,
    char: ballChars[i]!,
  })
}

function getBallPos(p: Pendulum): { x: number; y: number } {
  return {
    x: p.anchorX + Math.sin(p.angle) * ropeLength,
    y: anchorY + Math.cos(p.angle) * ropeLength,
  }
}

function pullLeft() {
  pendulums[0]!.angle = -Math.PI / 4
  pendulums[0]!.angularVel = 0
}

function pullRight() {
  pendulums[pendulums.length - 1]!.angle = Math.PI / 4
  pendulums[pendulums.length - 1]!.angularVel = 0
}

document.getElementById('btn-pull-left')!.addEventListener('click', pullLeft)
document.getElementById('btn-pull-right')!.addEventListener('click', pullRight)
document.getElementById('btn-pull-both')!.addEventListener('click', () => {
  pullLeft()
  pullRight()
})

// Start with left ball pulled
pullLeft()

// Drag
let dragIdx = -1

canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  for (let i = 0; i < pendulums.length; i++) {
    const pos = getBallPos(pendulums[i]!)
    const dx = mx - pos.x
    const dy = my - pos.y
    if (dx * dx + dy * dy < 30 * 30) {
      dragIdx = i
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
  const dx = mx - p.anchorX
  const dy = my - anchorY
  p.angle = Math.atan2(dx, dy)
  p.angularVel = 0
})

canvas.addEventListener('mouseup', () => { dragIdx = -1 })

const FIXED_DT = 1 / 240
const MAX_SUBSTEPS = 8
let accumulator = 0
let lastTime = performance.now()

function simulateStep(dt: number) {
  // Integrate pendulum angles (simple pendulum: alpha = -(g/L) * sin(theta))
  for (let i = 0; i < pendulums.length; i++) {
    if (i === dragIdx) continue
    const p = pendulums[i]!
    const alpha = -(gravity / ropeLength) * Math.sin(p.angle)
    p.angularVel += alpha * dt
    p.angularVel *= 0.9999 // minimal air resistance
    p.angle += p.angularVel * dt
  }

  // Collision detection between adjacent balls
  for (let i = 0; i < pendulums.length - 1; i++) {
    const a = pendulums[i]!
    const b = pendulums[i + 1]!
    const posA = getBallPos(a)
    const posB = getBallPos(b)
    const dx = posB.x - posA.x
    const dy = posB.y - posA.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < ballRadius * 2) {
      // Near-elastic collision with momentum transfer
      // For equal-mass pendulums: swap angular velocities
      const restitution = 0.99
      const velA = a.angularVel
      const velB = b.angularVel

      // Only collide if they're approaching
      if (velA > velB) {
        a.angularVel = velB * restitution
        b.angularVel = velA * restitution

        // Separate them slightly
        const overlap = (ballRadius * 2 - dist) / 2
        const nx = dx / dist
        const separationAngle = overlap / ropeLength
        a.angle -= separationAngle * (nx > 0 ? 1 : -1)
        b.angle += separationAngle * (nx > 0 ? 1 : -1)
      }
    }
  }
}

function frame(now: number) {
  const elapsed = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now
  accumulator += elapsed

  let steps = 0
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    simulateStep(FIXED_DT)
    accumulator -= FIXED_DT
    steps++
  }

  ctx.clearRect(0, 0, W, H)

  // Draw frame bar
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
    const pos = getBallPos(p)

    // Rope
    ctx.strokeStyle = '#555'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(p.anchorX, anchorY)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()

    // Ball glow
    const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 24)
    gradient.addColorStop(0, p.color + '33')
    gradient.addColorStop(1, 'transparent')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, 24, 0, Math.PI * 2)
    ctx.fill()

    // Ball circle
    ctx.strokeStyle = p.color + '88'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, ballRadius, 0, Math.PI * 2)
    ctx.stroke()

    // Character
    ctx.font = font
    ctx.fillStyle = p.color
    ctx.fillText(p.char, pos.x, pos.y)
  }

  // Anchor dots
  for (const p of pendulums) {
    ctx.fillStyle = '#666'
    ctx.beginPath()
    ctx.arc(p.anchorX, anchorY, 4, 0, Math.PI * 2)
    ctx.fill()
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
