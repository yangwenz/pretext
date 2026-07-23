import { createWorld, createBody, createConnection, step } from '../../src/physics/index.js'
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

const centerX = W / 2
const centerY = H / 2

const world = createWorld({
  gravity: { x: 0, y: 0 },
  bounds: { x: 0, y: 0, width: W, height: H },
  iterations: 4,
  damping: 0.999,
})

const font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
ctx.font = font

type WordOrbit = {
  bodies: Body[]
  color: string
  groupId: number
  trail: { x: number; y: number }[]
}

const orbits: WordOrbit[] = []
let groupCounter = 1

const orbitWords = ['STAR', 'MOON', 'COMET', 'DUST', 'VOID', 'NOVA', 'PULSE', 'GLOW']
const orbitColors = ['#feca57', '#48dbfb', '#ff6b6b', '#a29bfe', '#55efc4', '#fd79a8', '#74b9ff', '#00cec9']
let wordIdx = 0

function createOrbitWord(word: string, radius: number, angle: number, color: string): WordOrbit {
  const groupId = groupCounter++
  const bodies: Body[] = []
  const graphemes = [...word]
  const spacing = 2

  let totalWidth = 0
  const charWidths: number[] = []
  for (const char of graphemes) {
    const w = ctx.measureText(char).width
    charWidths.push(w)
    totalWidth += w + (charWidths.length > 1 ? spacing : 0)
  }

  // Position along a tangent to the orbit
  const orbitX = centerX + Math.cos(angle) * radius
  const orbitY = centerY + Math.sin(angle) * radius

  // Velocity perpendicular to radius (orbital velocity)
  const speed = Math.sqrt(800 * 300 / radius) * 1.2
  const vx = -Math.sin(angle) * speed
  const vy = Math.cos(angle) * speed

  let cx = orbitX - totalWidth / 2
  for (let i = 0; i < graphemes.length; i++) {
    const char = graphemes[i]!
    const charWidth = charWidths[i]!
    const body = createBody(world, char, font, {
      position: { x: cx + charWidth / 2, y: orbitY },
      velocity: { x: vx + (Math.random() - 0.5) * 5, y: vy + (Math.random() - 0.5) * 5 },
      mass: 1.5,
      width: charWidth,
      height: 22,
      restitution: 0.6,
      friction: 0.1,
      collisionGroup: groupId,
    })
    bodies.push(body)

    if (i > 0) {
      const prevWidth = charWidths[i - 1]!
      createConnection(world, {
        type: 'rigid',
        a: bodies[i - 1]!.id,
        b: body.id,
        length: (prevWidth + charWidth) / 2 + spacing,
      })
    }

    cx += charWidth + spacing
  }

  return { bodies, color, groupId, trail: [] }
}

// Initial orbital words
const radii = [100, 140, 180, 220]
for (let i = 0; i < 4; i++) {
  const word = orbitWords[i]!
  const color = orbitColors[i]!
  const angle = (i / 4) * Math.PI * 2
  orbits.push(createOrbitWord(word, radii[i]!, angle, color))
}

function addWord() {
  const word = orbitWords[wordIdx % orbitWords.length]!
  const color = orbitColors[wordIdx % orbitColors.length]!
  wordIdx++
  const radius = 100 + Math.random() * 150
  const angle = Math.random() * Math.PI * 2
  orbits.push(createOrbitWord(word, radius, angle, color))
}

function burst() {
  for (const orbit of orbits) {
    for (const body of orbit.bodies) {
      const dx = body.position.x - centerX
      const dy = body.position.y - centerY
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      body.velocity.x += (dx / dist) * 400
      body.velocity.y += (dy / dist) * 400
      body.sleeping = false
      body.sleepTimer = 0
    }
  }
}

function reverse() {
  for (const orbit of orbits) {
    for (const body of orbit.bodies) {
      body.velocity.x *= -1
      body.velocity.y *= -1
      body.sleeping = false
      body.sleepTimer = 0
    }
  }
}

document.getElementById('btn-add')!.addEventListener('click', addWord)
document.getElementById('btn-burst')!.addEventListener('click', burst)
document.getElementById('btn-reverse')!.addEventListener('click', reverse)

// Click attractor
let clickX = -1000
let clickY = -1000
let clicking = false

canvas.addEventListener('mousedown', (e) => {
  clicking = true
  const rect = canvas.getBoundingClientRect()
  clickX = e.clientX - rect.left
  clickY = e.clientY - rect.top
})

canvas.addEventListener('mousemove', (e) => {
  if (!clicking) return
  const rect = canvas.getBoundingClientRect()
  clickX = e.clientX - rect.left
  clickY = e.clientY - rect.top
})

canvas.addEventListener('mouseup', () => { clicking = false })

function applyCentralGravity() {
  const G = 800 * 300
  for (const orbit of orbits) {
    for (const body of orbit.bodies) {
      if (body.dead || body.sleeping) continue
      const dx = centerX - body.position.x
      const dy = centerY - body.position.y
      const distSq = dx * dx + dy * dy
      const dist = Math.sqrt(distSq) || 1
      if (dist < 20) continue
      const force = G / distSq
      body.force.x += dx / dist * force * body.mass
      body.force.y += dy / dist * force * body.mass
    }
  }

  // Click gravity
  if (clicking) {
    const clickG = 400 * 200
    for (const orbit of orbits) {
      for (const body of orbit.bodies) {
        if (body.dead || body.sleeping) continue
        const dx = clickX - body.position.x
        const dy = clickY - body.position.y
        const distSq = dx * dx + dy * dy
        const dist = Math.sqrt(distSq) || 1
        if (dist < 15) continue
        const force = clickG / distSq
        body.force.x += dx / dist * force * body.mass
        body.force.y += dy / dist * force * body.mass
      }
    }
  }
}

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
    applyCentralGravity()
    step(world, FIXED_DT)
    accumulator -= FIXED_DT
    steps++
  }

  // Update trails (from first body of each word)
  for (const orbit of orbits) {
    const lead = orbit.bodies[0]
    if (lead && !lead.dead) {
      orbit.trail.push({ x: lead.position.x, y: lead.position.y })
      if (orbit.trail.length > 60) orbit.trail.shift()
    }
  }

  ctx.clearRect(0, 0, W, H)

  // Draw center star
  const starGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 40)
  starGrad.addColorStop(0, 'rgba(255, 255, 200, 0.6)')
  starGrad.addColorStop(0.5, 'rgba(255, 200, 100, 0.2)')
  starGrad.addColorStop(1, 'transparent')
  ctx.fillStyle = starGrad
  ctx.beginPath()
  ctx.arc(centerX, centerY, 40, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#ffeaa7'
  ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText('✦', centerX, centerY)

  // Draw click attractor
  if (clicking) {
    const cGrad = ctx.createRadialGradient(clickX, clickY, 0, clickX, clickY, 30)
    cGrad.addColorStop(0, 'rgba(108, 138, 255, 0.5)')
    cGrad.addColorStop(1, 'transparent')
    ctx.fillStyle = cGrad
    ctx.beginPath()
    ctx.arc(clickX, clickY, 30, 0, Math.PI * 2)
    ctx.fill()
  }

  // Draw trails
  for (const orbit of orbits) {
    if (orbit.trail.length < 2) continue
    ctx.strokeStyle = orbit.color + '44'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(orbit.trail[0]!.x, orbit.trail[0]!.y)
    for (let i = 1; i < orbit.trail.length; i++) {
      ctx.lineTo(orbit.trail[i]!.x, orbit.trail[i]!.y)
    }
    ctx.stroke()
  }

  // Draw connections
  ctx.lineWidth = 1
  for (const orbit of orbits) {
    ctx.strokeStyle = orbit.color + '22'
    for (let i = 1; i < orbit.bodies.length; i++) {
      const a = orbit.bodies[i - 1]!
      const b = orbit.bodies[i]!
      if (a.dead || b.dead) continue
      ctx.beginPath()
      ctx.moveTo(a.position.x, a.position.y)
      ctx.lineTo(b.position.x, b.position.y)
      ctx.stroke()
    }
  }

  // Draw characters
  ctx.font = font
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (const orbit of orbits) {
    ctx.fillStyle = orbit.color
    for (const body of orbit.bodies) {
      if (body.dead) continue
      ctx.save()
      ctx.translate(body.position.x, body.position.y)
      ctx.rotate(body.angle)
      ctx.fillText(body.char, 0, 0)
      ctx.restore()
    }
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
