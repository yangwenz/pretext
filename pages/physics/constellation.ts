import { prepareWithSegments, layoutNextLine, type LayoutCursor } from '../../src/layout.js'
import { createWorld, createBody, step } from '../../src/physics/index.js'
import type { Body } from '../../src/physics/types.js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const dpr = window.devicePixelRatio || 1

const W = Math.min(900, window.innerWidth - 48)
const H = 650
canvas.width = W * dpr
canvas.height = H * dpr
canvas.style.width = `${W}px`
canvas.style.height = `${H}px`
ctx.scale(dpr, dpr)

const bodyFont = '16px Georgia, "Times New Roman", serif'
const lineHeight = 25
const marginX = 50
const textStartY = 50

const documentText = `The solar system is a clockwork of gravity. Eight worlds trace ellipses around a middle-aged star, each locked into an orbit shaped by mass and velocity. Mercury races closest, scorched and cratered. Venus spins backward under a crushing atmosphere. Earth alone carries oceans and life. Mars rusts in silence, waiting. Beyond the asteroid belt, Jupiter commands a court of moons — a failed star, still radiating more heat than it receives. Saturn floats in its rings of ice and dust. Uranus rolls on its side, a frozen mystery. Neptune howls with the fastest winds in the system. Between these worlds, the text you read now flows like interplanetary space — filling every gap the planets leave behind, reforming as they pass through, a reminder that even emptiness has structure when gravity is the architect.`

const prepared = prepareWithSegments(documentText, bodyFont)
const internalWidths: number[] = (prepared as any).widths
const segments: string[] = prepared.segments

// --- Solar system ---
const SUN_X = W / 2
const SUN_Y = H / 2
const SUN_RADIUS = 28

const world = createWorld({
  gravity: { x: 0, y: 0 },
  bounds: { x: 10, y: 10, width: W - 20, height: H - 20 },
  iterations: 4,
  damping: 0.9999,
  sleepThresholdVel: 0.01,
  sleepDelay: 500,
})

// Sun (static)
const sunBody = createBody(world, '☉', bodyFont, {
  position: { x: SUN_X, y: SUN_Y },
  mass: Infinity,
  width: SUN_RADIUS * 2,
  height: SUN_RADIUS * 2,
  collisionGroup: 99,
})

type Planet = {
  name: string
  body: Body
  orbitRadius: number
  radius: number
  speed: number
  phase: number
  color: string
  ringColor?: string | undefined
}

const planetDefs = [
  { name: 'Mercury', orbitRadius: 65,  radius: 4,  speed: 4.1,  color: '#a0a0a0' },
  { name: 'Venus',   orbitRadius: 90,  radius: 6,  speed: 3.0,  color: '#e8c87a' },
  { name: 'Earth',   orbitRadius: 120, radius: 7,  speed: 2.4,  color: '#4a9de8' },
  { name: 'Mars',    orbitRadius: 150, radius: 5,  speed: 1.9,  color: '#d45f3c' },
  { name: 'Jupiter', orbitRadius: 200, radius: 16, speed: 1.1,  color: '#d4a574' },
  { name: 'Saturn',  orbitRadius: 250, radius: 13, speed: 0.8,  color: '#e8d5a0', ringColor: '#c8b888' },
  { name: 'Uranus',  orbitRadius: 295, radius: 9,  speed: 0.55, color: '#7ecbc4' },
  { name: 'Neptune', orbitRadius: 330, radius: 9,  speed: 0.4,  color: '#4466cc' },
]

const planets: Planet[] = []

for (const def of planetDefs) {
  const phase = Math.random() * Math.PI * 2
  const startX = SUN_X + Math.cos(phase) * def.orbitRadius
  const startY = SUN_Y + Math.sin(phase) * def.orbitRadius

  const body = createBody(world, def.name[0]!, bodyFont, {
    position: { x: startX, y: startY },
    mass: 2,
    width: def.radius * 2,
    height: def.radius * 2,
    restitution: 0.5,
    friction: 0,
    collisionGroup: 0,
  })

  planets.push({
    name: def.name,
    body,
    orbitRadius: def.orbitRadius,
    radius: def.radius,
    speed: def.speed,
    phase,
    color: def.color,
    ringColor: def.ringColor,
  })
}

// --- Drag ---
let dragIdx = -1

canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i]!
    const dx = mx - p.body.position.x
    const dy = my - p.body.position.y
    if (dx * dx + dy * dy < (p.radius + 10) * (p.radius + 10)) {
      dragIdx = i
      p.body.mass = Infinity
      break
    }
  }
})

canvas.addEventListener('mousemove', (e) => {
  if (dragIdx < 0) return
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const p = planets[dragIdx]!.body
  p.position.x = mx
  p.position.y = my
  p.velocity.x = 0
  p.velocity.y = 0
})

function releaseDrag() {
  if (dragIdx >= 0) {
    planets[dragIdx]!.body.mass = 2
    planets[dragIdx]!.body.sleeping = false
    planets[dragIdx]!.body.sleepTimer = 0
    dragIdx = -1
  }
}

canvas.addEventListener('mouseup', releaseDrag)
canvas.addEventListener('mouseleave', releaseDrag)

// --- Text layout around planets and sun ---
type PositionedWord = { text: string; x: number; y: number; width: number }

function layoutAroundPlanets(): PositionedWord[] {
  const words: PositionedWord[] = []
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let lineTop = textStartY
  const regionLeft = marginX
  const regionRight = W - marginX

  while (lineTop + lineHeight < H - 30) {
    const bandTop = lineTop
    const bandBottom = lineTop + lineHeight

    const blocked: { left: number; right: number }[] = []

    // Sun blocks text
    const sunTop = sunBody.position.y - SUN_RADIUS - 4
    const sunBot = sunBody.position.y + SUN_RADIUS + 4
    if (sunBot > bandTop && sunTop < bandBottom) {
      blocked.push({
        left: sunBody.position.x - SUN_RADIUS - 6,
        right: sunBody.position.x + SUN_RADIUS + 6,
      })
    }

    // Planets block text
    for (const p of planets) {
      const pTop = p.body.position.y - p.radius - 4
      const pBot = p.body.position.y + p.radius + 4
      if (pBot > bandTop && pTop < bandBottom) {
        blocked.push({
          left: p.body.position.x - p.radius - 6,
          right: p.body.position.x + p.radius + 6,
        })
      }
    }

    // Sort and merge
    blocked.sort((a, b) => a.left - b.left)
    const merged: { left: number; right: number }[] = []
    for (const b of blocked) {
      const last = merged[merged.length - 1]
      if (last && b.left <= last.right) {
        last.right = Math.max(last.right, b.right)
      } else {
        merged.push({ left: b.left, right: b.right })
      }
    }

    // Carve available slots
    const slots: { left: number; right: number }[] = []
    let slotLeft = regionLeft
    for (const b of merged) {
      if (b.left > slotLeft) slots.push({ left: slotLeft, right: b.left })
      slotLeft = Math.max(slotLeft, b.right)
    }
    if (slotLeft < regionRight) slots.push({ left: slotLeft, right: regionRight })

    if (slots.length === 0) {
      lineTop += lineHeight
      continue
    }

    let done = false
    for (const slot of slots) {
      const slotWidth = slot.right - slot.left
      if (slotWidth < 30) continue

      const line = layoutNextLine(prepared, cursor, slotWidth)
      if (line === null) { done = true; break }

      let x = slot.left
      let segIdx = line.start.segmentIndex
      let gIdx = line.start.graphemeIndex

      while (segIdx < line.end.segmentIndex || (segIdx === line.end.segmentIndex && gIdx < line.end.graphemeIndex)) {
        const segText = segments[segIdx]!
        const segWidth = internalWidths[segIdx]!

        if (segIdx === line.start.segmentIndex && gIdx > 0) {
          const slice = segText.slice(gIdx)
          ctx.font = bodyFont
          const sliceWidth = ctx.measureText(slice).width
          if (slice.trim().length > 0) words.push({ text: slice, x, y: lineTop, width: sliceWidth })
          x += sliceWidth
        } else if (segIdx === line.end.segmentIndex && line.end.graphemeIndex > 0 && line.end.graphemeIndex < segText.length) {
          const slice = segText.slice(0, line.end.graphemeIndex)
          ctx.font = bodyFont
          const sliceWidth = ctx.measureText(slice).width
          if (slice.trim().length > 0) words.push({ text: slice, x, y: lineTop, width: sliceWidth })
          x += sliceWidth
        } else {
          if (segText.trim().length > 0) words.push({ text: segText, x, y: lineTop, width: segWidth })
          x += segWidth
        }

        segIdx++
        gIdx = 0
        if (segIdx > line.end.segmentIndex) break
        if (segIdx === line.end.segmentIndex && line.end.graphemeIndex === 0) break
      }

      cursor = line.end
    }

    if (done) break
    lineTop += lineHeight
  }

  return words
}

// --- Background stars ---
type BgStar = { x: number; y: number; size: number; alpha: number; phase: number }
const bgStars: BgStar[] = []
for (let i = 0; i < 120; i++) {
  bgStars.push({
    x: Math.random() * W,
    y: Math.random() * H,
    size: 0.3 + Math.random() * 1,
    alpha: 0.06 + Math.random() * 0.12,
    phase: Math.random() * Math.PI * 2,
  })
}

// --- Render loop ---
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

  // Orbital forces — each planet orbits the Sun
  for (const p of planets) {
    if (p.body.mass === Infinity) continue
    const dx = SUN_X - p.body.position.x
    const dy = SUN_Y - p.body.position.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    // Centripetal pull toward sun
    const pull = 3 * (dist - p.orbitRadius)
    p.body.force.x += (dx / dist) * pull
    p.body.force.y += (dy / dist) * pull
    // Tangential force for orbit
    const tangentX = -dy / dist
    const tangentY = dx / dist
    p.body.force.x += tangentX * p.speed * 60
    p.body.force.y += tangentY * p.speed * 60
    p.body.sleeping = false
    p.body.sleepTimer = 0
  }

  let steps = 0
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    step(world, FIXED_DT)
    accumulator -= FIXED_DT
    steps++
  }

  // --- Render ---
  ctx.clearRect(0, 0, W, H)

  // Background stars
  for (const s of bgStars) {
    const twinkle = Math.sin(time * 1.5 + s.phase) * 0.3 + 0.7
    ctx.fillStyle = `rgba(180, 200, 255, ${s.alpha * twinkle})`
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
    ctx.fill()
  }

  // Orbit paths (faint ellipses)
  ctx.lineWidth = 0.5
  for (const p of planets) {
    ctx.strokeStyle = `rgba(100, 120, 180, 0.12)`
    ctx.beginPath()
    ctx.arc(SUN_X, SUN_Y, p.orbitRadius, 0, Math.PI * 2)
    ctx.stroke()
  }

  // --- Reflow text ---
  const words = layoutAroundPlanets()

  ctx.font = bodyFont
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  for (const w of words) {
    // Tint words by proximity to sun/planets
    const dxSun = (w.x + w.width / 2) - SUN_X
    const dySun = (w.y + lineHeight / 2) - SUN_Y
    const distSun = Math.sqrt(dxSun * dxSun + dySun * dySun)
    const sunTint = Math.max(0, 1 - distSun / 60)

    let nearestPlanetDist = Infinity
    let nearestColor = ''
    for (const p of planets) {
      const dpx = (w.x + w.width / 2) - p.body.position.x
      const dpy = (w.y + lineHeight / 2) - p.body.position.y
      const dp = Math.sqrt(dpx * dpx + dpy * dpy)
      if (dp < nearestPlanetDist) {
        nearestPlanetDist = dp
        nearestColor = p.color
      }
    }
    const planetTint = Math.max(0, 1 - nearestPlanetDist / 40)

    if (sunTint > 0.05) {
      ctx.fillStyle = '#ffd54f'
      ctx.globalAlpha = 0.5 + (1 - sunTint) * 0.5
    } else if (planetTint > 0.05) {
      ctx.fillStyle = nearestColor
      ctx.globalAlpha = 0.5 + (1 - planetTint) * 0.5
    } else {
      ctx.fillStyle = '#b0aaa4'
      ctx.globalAlpha = 0.85
    }
    ctx.fillText(w.text, w.x, w.y)
  }
  ctx.globalAlpha = 1

  // --- Draw Sun ---
  // Corona
  const corona = ctx.createRadialGradient(SUN_X, SUN_Y, SUN_RADIUS, SUN_X, SUN_Y, SUN_RADIUS * 3)
  corona.addColorStop(0, 'rgba(255, 200, 50, 0.15)')
  corona.addColorStop(0.5, 'rgba(255, 150, 30, 0.05)')
  corona.addColorStop(1, 'transparent')
  ctx.fillStyle = corona
  ctx.beginPath()
  ctx.arc(SUN_X, SUN_Y, SUN_RADIUS * 3, 0, Math.PI * 2)
  ctx.fill()

  // Sun body
  const sunGrad = ctx.createRadialGradient(SUN_X - 5, SUN_Y - 5, 2, SUN_X, SUN_Y, SUN_RADIUS)
  sunGrad.addColorStop(0, '#fff8e0')
  sunGrad.addColorStop(0.4, '#ffd54f')
  sunGrad.addColorStop(0.8, '#ff9800')
  sunGrad.addColorStop(1, '#e65100')
  ctx.fillStyle = sunGrad
  ctx.beginPath()
  ctx.arc(SUN_X, SUN_Y, SUN_RADIUS, 0, Math.PI * 2)
  ctx.fill()

  // --- Draw planets ---
  for (const p of planets) {
    const bx = p.body.position.x
    const by = p.body.position.y

    // Glow
    const glow = ctx.createRadialGradient(bx, by, p.radius * 0.3, bx, by, p.radius * 2.5)
    glow.addColorStop(0, p.color + '25')
    glow.addColorStop(1, 'transparent')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(bx, by, p.radius * 2.5, 0, Math.PI * 2)
    ctx.fill()

    // Planet body
    const pGrad = ctx.createRadialGradient(bx - p.radius * 0.3, by - p.radius * 0.3, 1, bx, by, p.radius)
    pGrad.addColorStop(0, '#ffffff')
    pGrad.addColorStop(0.3, p.color)
    pGrad.addColorStop(1, p.color + '88')
    ctx.fillStyle = pGrad
    ctx.beginPath()
    ctx.arc(bx, by, p.radius, 0, Math.PI * 2)
    ctx.fill()

    // Saturn's ring
    if (p.ringColor) {
      ctx.save()
      ctx.strokeStyle = p.ringColor
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(bx, by, p.radius * 2.2, p.radius * 0.5, -0.3, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    // Planet label
    ctx.font = '9px -apple-system, sans-serif'
    ctx.fillStyle = `rgba(200, 200, 220, 0.5)`
    ctx.textBaseline = 'top'
    ctx.textAlign = 'center'
    ctx.fillText(p.name, bx, by + p.radius + 4)
  }

  // Caption
  ctx.font = 'italic 11px Georgia, "Times New Roman", serif'
  ctx.fillStyle = '#3a3a5a'
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'center'
  ctx.fillText('layoutNextLine() reflows text around the solar system — drag any planet to disturb its orbit', W / 2, H - 12)

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
