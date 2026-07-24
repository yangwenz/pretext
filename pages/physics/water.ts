import { createWorld, createBody, step } from '../../src/physics/index.js'
import { prepareWithSegments, layoutWithLines } from '../../src/layout.js'
import type { Body } from '../../src/physics/types.js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const dpr = window.devicePixelRatio || 1

const W = Math.min(900, window.innerWidth - 48)
const H = 640
canvas.width = W * dpr
canvas.height = H * dpr
canvas.style.width = `${W}px`
canvas.style.height = `${H}px`
ctx.scale(dpr, dpr)

// --- Text setup ---
const text = "Water is the softest thing, yet it can penetrate mountains and earth. This shows how yielding overcomes the rigid. The fluid embraces every shape it encounters."
const font = '20px Georgia, "Times New Roman", serif'
const lineHeight = 28
const maxWidth = W - 100
const offsetX = 50
const offsetY = 50

const world = createWorld({
  gravity: { x: 0, y: 600 },
  bounds: { x: 0, y: 0, width: W, height: H + 200 },
  iterations: 3,
  damping: 0.98,
})

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
function splitGraphemes(s: string): string[] {
  return [...graphemeSegmenter.segment(s)].map(seg => seg.segment)
}

const prepared = prepareWithSegments(text, font)
const layout = layoutWithLines(prepared, maxWidth, lineHeight)

ctx.font = font

// --- Water surface ---
const WATER_LEVEL = H * 0.48
const WAVE_POINTS = 80
const waveHeights: number[] = new Array(WAVE_POINTS).fill(0)
const waveVelocities: number[] = new Array(WAVE_POINTS).fill(0)
const WAVE_TENSION = 0.025
const WAVE_DAMPING = 0.97
const WAVE_SPREAD = 0.25

// --- Character particles ---
type CharParticle = {
  body: Body
  restX: number
  restY: number
  released: boolean
  releaseTime: number
  submerged: number  // 0..1 how submerged
  bubble: number     // bubble animation timer
  opacity: number
}

const particles: CharParticle[] = []
let nextReleaseIndex = 0
let releaseTimer = 0
const RELEASE_INTERVAL = 0.06

for (let lineIdx = 0; lineIdx < layout.lines.length; lineIdx++) {
  const line = layout.lines[lineIdx]!
  const graphemes = splitGraphemes(line.text)
  const y = offsetY + lineIdx * lineHeight + lineHeight / 2
  let x = offsetX

  for (const grapheme of graphemes) {
    const charWidth = ctx.measureText(grapheme).width
    const body = createBody(world, grapheme, font, {
      position: { x: x + charWidth / 2, y },
      mass: 0.5 + Math.random() * 0.5,
      width: charWidth,
      height: lineHeight * 0.75,
      restitution: 0.2,
      friction: 0.4,
    })
    body.sleeping = true
    particles.push({
      body,
      restX: x + charWidth / 2,
      restY: y,
      released: false,
      releaseTime: 0,
      submerged: 0,
      bubble: Math.random() * Math.PI * 2,
      opacity: 1,
    })
    x += charWidth
  }
}

// --- Splash ripples ---
type Ripple = { x: number; time: number; strength: number }
const ripples: Ripple[] = []

function splashAt(x: number, strength: number) {
  const idx = Math.round(((x / W) * (WAVE_POINTS - 1)))
  const clampedIdx = Math.max(0, Math.min(WAVE_POINTS - 1, idx))
  waveVelocities[clampedIdx]! += strength
  ripples.push({ x, time: 0, strength: Math.abs(strength) })
}

// --- Bubbles ---
type Bubble = { x: number; y: number; radius: number; speed: number; wobble: number; life: number }
const bubbles: Bubble[] = []

function spawnBubble(x: number, y: number) {
  bubbles.push({
    x: x + (Math.random() - 0.5) * 10,
    y,
    radius: 1 + Math.random() * 3,
    speed: 30 + Math.random() * 50,
    wobble: Math.random() * Math.PI * 2,
    life: 0,
  })
}

// --- Click to splash ---
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top

  if (my > WATER_LEVEL - 40) {
    splashAt(mx, -15 - Math.random() * 10)
    for (let i = 0; i < 8; i++) {
      spawnBubble(mx + (Math.random() - 0.5) * 40, my)
    }
  }

  // Push nearby floating chars
  for (const p of particles) {
    if (!p.released) continue
    const dx = p.body.position.x - mx
    const dy = p.body.position.y - my
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 120) {
      const force = (1 - dist / 120) * 400
      p.body.velocity.x += (dx / (dist || 1)) * force
      p.body.velocity.y += (dy / (dist || 1)) * force * 0.5
      p.body.sleeping = false
      p.body.sleepTimer = 0
    }
  }
})

// --- Physics + render loop ---
const FIXED_DT = 1 / 120
const MAX_SUBSTEPS = 4
let accumulator = 0
let lastTime = performance.now()
let time = 0

function getWaveHeightAt(x: number): number {
  const t = (x / W) * (WAVE_POINTS - 1)
  const i = Math.floor(t)
  const f = t - i
  const a = waveHeights[Math.max(0, Math.min(WAVE_POINTS - 1, i))]!
  const b = waveHeights[Math.max(0, Math.min(WAVE_POINTS - 1, i + 1))]!
  return WATER_LEVEL + a * (1 - f) + b * f
}

function frame(now: number) {
  const elapsed = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now
  accumulator += elapsed
  time += elapsed

  // Release characters one by one
  releaseTimer += elapsed
  while (releaseTimer >= RELEASE_INTERVAL && nextReleaseIndex < particles.length) {
    const p = particles[nextReleaseIndex]!
    if (p.body.char.trim().length > 0) {
      p.released = true
      p.releaseTime = time
      p.body.sleeping = false
      p.body.sleepTimer = 0
      p.body.velocity.x = (Math.random() - 0.5) * 30
      p.body.velocity.y = 20 + Math.random() * 40
    } else {
      p.released = true
      p.releaseTime = time
      p.opacity = 0
    }
    nextReleaseIndex++
    releaseTimer -= RELEASE_INTERVAL
  }

  // Wave simulation — spring-mass with neighbor spread
  for (let i = 0; i < WAVE_POINTS; i++) {
    // Spring to rest
    let accel = -WAVE_TENSION * waveHeights[i]!
    // Neighbor coupling (spread)
    if (i > 0) accel += WAVE_SPREAD * (waveHeights[i - 1]! - waveHeights[i]!)
    if (i < WAVE_POINTS - 1) accel += WAVE_SPREAD * (waveHeights[i + 1]! - waveHeights[i]!)
    waveVelocities[i]! += accel
    waveVelocities[i]! *= WAVE_DAMPING
  }
  for (let i = 0; i < WAVE_POINTS; i++) {
    waveHeights[i]! += waveVelocities[i]!
    // Clamp to prevent blowup
    waveHeights[i] = Math.max(-30, Math.min(30, waveHeights[i]!))
  }

  // Ambient wave — applied as a gentle displacement, not accumulated velocity
  for (let i = 0; i < WAVE_POINTS; i++) {
    const ambient = Math.sin(time * 1.2 + i * 0.3) * 0.3 + Math.sin(time * 0.7 + i * 0.15) * 0.2
    waveHeights[i]! += ambient * 0.05
  }

  // Buoyancy and drag for submerged characters
  for (const p of particles) {
    if (!p.released) continue
    const body = p.body
    const surfaceY = getWaveHeightAt(body.position.x)
    const charBottom = body.position.y + body.height / 2

    if (charBottom > surfaceY) {
      const depth = Math.min(1, (charBottom - surfaceY) / body.height)
      p.submerged = depth

      // Buoyancy
      const buoyancy = -world.config.gravity.y * body.mass * depth * 1.3
      body.force.y += buoyancy

      // Drag
      body.velocity.x *= 0.97
      body.velocity.y *= 0.96
      body.angularVelocity *= 0.95

      // Slight surface current
      body.force.x += Math.sin(time * 0.5 + body.position.x * 0.01) * 8 * depth

      // Wake the body
      body.sleeping = false
      body.sleepTimer = 0

      // Splash on entry
      if (p.submerged < 0.3 && Math.abs(body.velocity.y) > 50) {
        const splashStrength = Math.min(12, Math.abs(body.velocity.y) * 0.04)
        splashAt(body.position.x, -splashStrength)
        if (Math.random() < 0.5) spawnBubble(body.position.x, surfaceY)
      }
    } else {
      p.submerged = 0
    }

    // Spawn occasional bubbles for submerged chars
    if (p.submerged > 0.5 && Math.random() < 0.003) {
      spawnBubble(body.position.x, body.position.y)
    }

    // Keep chars roughly on-screen horizontally
    if (body.position.x < 20) body.force.x += 50
    if (body.position.x > W - 20) body.force.x -= 50

    // Prevent sinking too deep
    if (body.position.y > H - 30) {
      body.force.y -= 200
      body.velocity.y *= 0.8
    }
  }

  // Physics step
  let steps = 0
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    step(world, FIXED_DT)
    accumulator -= FIXED_DT
    steps++
  }

  // Update bubbles
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]!
    b.life += elapsed
    b.y -= b.speed * elapsed
    b.x += Math.sin(b.wobble + b.life * 3) * 0.5
    const surfaceY = getWaveHeightAt(b.x)
    if (b.y < surfaceY - 5 || b.life > 3) {
      bubbles.splice(i, 1)
    }
  }

  // Update ripples
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i]!
    r.time += elapsed
    if (r.time > 1.5) ripples.splice(i, 1)
  }

  // --- Render ---
  ctx.clearRect(0, 0, W, H)

  // --- Draw unreleased text (still in position) ---
  ctx.font = font
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (const p of particles) {
    if (p.released) continue
    ctx.fillStyle = '#c8c4be'
    ctx.fillText(p.body.char, p.restX, p.restY)
  }

  // --- Draw water background (deep gradient) ---
  const waterGrad = ctx.createLinearGradient(0, WATER_LEVEL - 20, 0, H)
  waterGrad.addColorStop(0, 'rgba(2, 20, 50, 0.0)')
  waterGrad.addColorStop(0.05, 'rgba(2, 20, 50, 0.4)')
  waterGrad.addColorStop(0.3, 'rgba(4, 30, 70, 0.7)')
  waterGrad.addColorStop(0.7, 'rgba(2, 15, 45, 0.85)')
  waterGrad.addColorStop(1, 'rgba(1, 8, 25, 0.95)')

  // Draw water body with wave surface
  ctx.beginPath()
  ctx.moveTo(0, H)
  for (let i = 0; i <= WAVE_POINTS; i++) {
    const x = (i / WAVE_POINTS) * W
    const y = i < WAVE_POINTS ? WATER_LEVEL + waveHeights[i]! : WATER_LEVEL + waveHeights[WAVE_POINTS - 1]!
    if (i === 0) ctx.lineTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.lineTo(W, H)
  ctx.closePath()
  ctx.fillStyle = waterGrad
  ctx.fill()

  // --- Caustic light rays underwater ---
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  for (let i = 0; i < 6; i++) {
    const phase = time * 0.4 + i * 1.1
    const x = W * (0.1 + (i * 0.15 + Math.sin(phase) * 0.05))
    const surfaceY = getWaveHeightAt(x)
    const grad = ctx.createLinearGradient(x, surfaceY, x + Math.sin(phase) * 30, H)
    grad.addColorStop(0, `rgba(60, 180, 255, ${0.03 + Math.sin(phase * 1.3) * 0.015})`)
    grad.addColorStop(0.5, `rgba(40, 140, 220, ${0.015 + Math.sin(phase) * 0.01})`)
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(x - 15, surfaceY)
    ctx.lineTo(x + 15, surfaceY)
    ctx.lineTo(x + Math.sin(phase) * 30 + 20, H)
    ctx.lineTo(x + Math.sin(phase) * 30 - 20, H)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()

  // --- Draw floating/submerged characters ---
  ctx.font = font
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (const p of particles) {
    if (!p.released || p.opacity <= 0) continue
    const body = p.body
    const surfaceY = getWaveHeightAt(body.position.x)

    // Color varies with submersion depth
    let r: number, g: number, b: number, alpha: number
    if (p.submerged > 0) {
      const depth = Math.min(1, (body.position.y - surfaceY) / (H - surfaceY))
      r = Math.round(100 + (1 - depth) * 100)
      g = Math.round(180 + (1 - depth) * 60)
      b = Math.round(220 + (1 - depth) * 35)
      alpha = Math.max(0.3, 1 - depth * 0.6)
    } else {
      r = 200
      g = 195
      b = 190
      alpha = 1
    }

    ctx.save()
    ctx.translate(body.position.x, body.position.y)
    ctx.rotate(body.angle)

    // Underwater refraction distortion
    if (p.submerged > 0.2) {
      const distort = Math.sin(time * 2 + body.position.x * 0.05) * p.submerged * 1.5
      ctx.translate(distort, 0)
    }

    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
    ctx.fillText(body.char, 0, 0)
    ctx.restore()
  }

  // --- Draw wave surface highlight ---
  ctx.beginPath()
  ctx.moveTo(0, getWaveHeightAt(0))
  for (let i = 1; i <= WAVE_POINTS; i++) {
    const x = (i / WAVE_POINTS) * W
    const y = WATER_LEVEL + waveHeights[Math.min(i, WAVE_POINTS - 1)]!
    ctx.lineTo(x, y)
  }
  const surfaceGrad = ctx.createLinearGradient(0, 0, W, 0)
  surfaceGrad.addColorStop(0, 'rgba(79, 195, 247, 0.3)')
  surfaceGrad.addColorStop(0.3, 'rgba(129, 212, 250, 0.5)')
  surfaceGrad.addColorStop(0.5, 'rgba(179, 229, 252, 0.6)')
  surfaceGrad.addColorStop(0.7, 'rgba(129, 212, 250, 0.5)')
  surfaceGrad.addColorStop(1, 'rgba(79, 195, 247, 0.3)')
  ctx.strokeStyle = surfaceGrad
  ctx.lineWidth = 2
  ctx.stroke()

  // Secondary highlight line
  ctx.beginPath()
  for (let i = 0; i <= WAVE_POINTS; i++) {
    const x = (i / WAVE_POINTS) * W
    const y = WATER_LEVEL + waveHeights[Math.min(i, WAVE_POINTS - 1)]! + 3
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = 'rgba(79, 195, 247, 0.15)'
  ctx.lineWidth = 1
  ctx.stroke()

  // --- Draw bubbles ---
  for (const b of bubbles) {
    const fadeIn = Math.min(1, b.life * 4)
    const fadeOut = b.y < getWaveHeightAt(b.x) + 20 ? Math.max(0, (b.y - getWaveHeightAt(b.x) + 5) / 25) : 1
    const alpha = fadeIn * fadeOut * 0.6
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(150, 220, 255, ${alpha})`
    ctx.lineWidth = 0.8
    ctx.stroke()
    // Highlight
    ctx.beginPath()
    ctx.arc(b.x - b.radius * 0.3, b.y - b.radius * 0.3, b.radius * 0.3, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(200, 240, 255, ${alpha * 0.5})`
    ctx.fill()
  }

  // --- Draw ripple rings ---
  for (const r of ripples) {
    const radius = r.time * 80
    const alpha = Math.max(0, (1 - r.time / 1.5) * 0.3 * Math.min(1, r.strength / 5))
    ctx.beginPath()
    ctx.arc(r.x, WATER_LEVEL, radius, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(150, 220, 255, ${alpha})`
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  // --- Surface foam/particles ---
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  for (let i = 0; i < 20; i++) {
    const phase = time * 0.3 + i * 3.7
    const x = ((phase * 40 + i * 47) % (W + 40)) - 20
    const surfY = getWaveHeightAt(x)
    const bobble = Math.sin(time * 1.5 + i * 2) * 2
    const alpha = 0.1 + Math.sin(time + i) * 0.05
    ctx.fillStyle = `rgba(180, 230, 255, ${alpha})`
    ctx.beginPath()
    ctx.arc(x, surfY + bobble + 2, 1 + Math.sin(i) * 0.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // --- Caption ---
  ctx.font = 'italic 11px Georgia, "Times New Roman", serif'
  ctx.fillStyle = '#3a5570'
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'center'
  ctx.fillText('Characters dissolve into water with buoyancy, waves, and ripples — click to splash', W / 2, H - 12)

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
