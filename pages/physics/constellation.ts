import { prepareWithSegments, layoutNextLine, type LayoutCursor } from '../../src/layout.js'
import { createWorld, createBody, step, createConnection } from '../../src/physics/index.js'
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

const documentText = `We are all made of stars. Every atom in your body was once inside a star that exploded. You are stardust, gathered by gravity into a form that can wonder at its own existence. Look up at the night sky and see your ancestry written in light. The constellations are not fixed — they drift apart over millennia, their patterns dissolving into new arrangements that future eyes will name. What we call Orion will scatter. What we call home will cool. But the atoms persist, cycling through stars and planets and beings, endlessly recomposed. There is no boundary between you and the universe; only a temporary concentration of complexity that looks back at the whole and says: I see you. I am you. We are the cosmos examining itself, briefly, before returning to the dance.`

const prepared = prepareWithSegments(documentText, bodyFont)
const internalWidths: number[] = (prepared as any).widths
const segments: string[] = prepared.segments

// --- Orbiting bodies (stars/planets) ---
const world = createWorld({
  gravity: { x: 0, y: 0 },
  bounds: { x: 20, y: 20, width: W - 40, height: H - 40 },
  iterations: 6,
  damping: 0.999,
  sleepThresholdVel: 0.05,
  sleepDelay: 300,
})

const STAR_COUNT = 6
const starRadius = 12
const starColors = ['#6c8aff', '#a78bfa', '#4fc3f7', '#f9a825', '#ff6b6b', '#69f0ae']

type StarBody = {
  body: Body
  color: string
  orbitCenterX: number
  orbitCenterY: number
  orbitRadius: number
  orbitSpeed: number
  phase: number
}

const starBodies: StarBody[] = []

for (let i = 0; i < STAR_COUNT; i++) {
  const orbitCX = W * (0.2 + Math.random() * 0.6)
  const orbitCY = H * (0.2 + Math.random() * 0.6)
  const orbitR = 60 + Math.random() * 100
  const phase = Math.random() * Math.PI * 2
  const speed = 0.4 + Math.random() * 0.5

  const startX = orbitCX + Math.cos(phase) * orbitR
  const startY = orbitCY + Math.sin(phase) * orbitR

  const body = createBody(world, '★', bodyFont, {
    position: { x: startX, y: startY },
    mass: 3,
    width: starRadius * 2,
    height: starRadius * 2,
    restitution: 0.8,
    friction: 0,
    collisionGroup: 0,
  })

  starBodies.push({
    body,
    color: starColors[i % starColors.length]!,
    orbitCenterX: orbitCX,
    orbitCenterY: orbitCY,
    orbitRadius: orbitR,
    orbitSpeed: speed,
    phase,
  })
}

// Connections between some stars (visual constellation lines that also constrain physics)
const constellationPairs: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 4], [2, 5]]
for (const [a, b] of constellationPairs) {
  const bodyA = starBodies[a]!.body
  const bodyB = starBodies[b]!.body
  const dx = bodyA.position.x - bodyB.position.x
  const dy = bodyA.position.y - bodyB.position.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  createConnection(world, {
    type: 'spring',
    a: bodyA.id,
    b: bodyB.id,
    stiffness: 2,
    damping: 0.5,
    restLength: Math.min(dist, 200),
  })
}

// --- Drag ---
let dragIdx = -1

canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  for (let i = 0; i < starBodies.length; i++) {
    const s = starBodies[i]!.body
    const dx = mx - s.position.x
    const dy = my - s.position.y
    if (dx * dx + dy * dy < (starRadius + 10) * (starRadius + 10)) {
      dragIdx = i
      s.mass = Infinity
      break
    }
  }
})

canvas.addEventListener('mousemove', (e) => {
  if (dragIdx < 0) return
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const s = starBodies[dragIdx]!.body
  s.position.x = mx
  s.position.y = my
  s.velocity.x = 0
  s.velocity.y = 0
})

function releaseDrag() {
  if (dragIdx >= 0) {
    starBodies[dragIdx]!.body.mass = 3
    starBodies[dragIdx]!.body.sleeping = false
    starBodies[dragIdx]!.body.sleepTimer = 0
    dragIdx = -1
  }
}

canvas.addEventListener('mouseup', releaseDrag)
canvas.addEventListener('mouseleave', releaseDrag)

// Click to pulse
canvas.addEventListener('click', (e) => {
  if (dragIdx >= 0) return
  const rect = canvas.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  for (const s of starBodies) {
    const dx = s.body.position.x - cx
    const dy = s.body.position.y - cy
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const impulse = 300 / (1 + dist * 0.01)
    s.body.velocity.x += (dx / dist) * impulse * 0.05
    s.body.velocity.y += (dy / dist) * impulse * 0.05
    s.body.sleeping = false
    s.body.sleepTimer = 0
  }
})

// --- Text layout around stars ---
type PositionedWord = { text: string; x: number; y: number; width: number }

function layoutAroundStars(): PositionedWord[] {
  const words: PositionedWord[] = []
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let lineTop = textStartY
  const regionLeft = marginX
  const regionRight = W - marginX

  while (lineTop + lineHeight < H - 30) {
    const bandTop = lineTop
    const bandBottom = lineTop + lineHeight

    // Find stars overlapping this line band
    const blocked: { left: number; right: number }[] = []
    for (const s of starBodies) {
      const starTop = s.body.position.y - starRadius - 4
      const starBottom = s.body.position.y + starRadius + 4
      if (starBottom > bandTop && starTop < bandBottom) {
        blocked.push({
          left: s.body.position.x - starRadius - 6,
          right: s.body.position.x + starRadius + 6,
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

// --- Background decoration ---
type BgStar = { x: number; y: number; size: number; alpha: number; phase: number }
const bgStars: BgStar[] = []
for (let i = 0; i < 100; i++) {
  bgStars.push({
    x: Math.random() * W,
    y: Math.random() * H,
    size: 0.3 + Math.random() * 1,
    alpha: 0.08 + Math.random() * 0.15,
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

  // Orbital forces
  for (const s of starBodies) {
    if (s.body.mass === Infinity) continue
    // Gentle orbit around their center
    const dx = s.orbitCenterX - s.body.position.x
    const dy = s.orbitCenterY - s.body.position.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    // Centripetal
    s.body.force.x += dx * 2
    s.body.force.y += dy * 2
    // Tangential
    const tangentX = -dy / dist
    const tangentY = dx / dist
    s.body.force.x += tangentX * s.orbitSpeed * 80
    s.body.force.y += tangentY * s.orbitSpeed * 80
    s.body.sleeping = false
    s.body.sleepTimer = 0
  }

  let steps = 0
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    step(world, FIXED_DT)
    accumulator -= FIXED_DT
    steps++
  }

  // --- Render ---
  ctx.clearRect(0, 0, W, H)

  // Nebula background
  const nebula1 = ctx.createRadialGradient(W * 0.25, H * 0.35, 30, W * 0.25, H * 0.35, 200)
  nebula1.addColorStop(0, 'rgba(30, 15, 60, 0.06)')
  nebula1.addColorStop(1, 'transparent')
  ctx.fillStyle = nebula1
  ctx.fillRect(0, 0, W, H)

  const nebula2 = ctx.createRadialGradient(W * 0.75, H * 0.6, 20, W * 0.75, H * 0.6, 180)
  nebula2.addColorStop(0, 'rgba(15, 30, 80, 0.05)')
  nebula2.addColorStop(1, 'transparent')
  ctx.fillStyle = nebula2
  ctx.fillRect(0, 0, W, H)

  // Background stars
  for (const s of bgStars) {
    const twinkle = Math.sin(time * 1.5 + s.phase) * 0.3 + 0.7
    ctx.fillStyle = `rgba(180, 200, 255, ${s.alpha * twinkle})`
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
    ctx.fill()
  }

  // Constellation connection lines
  ctx.lineWidth = 0.8
  for (const [aIdx, bIdx] of constellationPairs) {
    const a = starBodies[aIdx]!.body
    const b = starBodies[bIdx]!.body
    const dx = a.position.x - b.position.x
    const dy = a.position.y - b.position.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const alpha = Math.max(0, Math.min(0.25, 1 - dist / 400))
    ctx.strokeStyle = `rgba(140, 160, 255, ${alpha})`
    ctx.beginPath()
    ctx.moveTo(a.position.x, a.position.y)
    ctx.lineTo(b.position.x, b.position.y)
    ctx.stroke()
  }

  // --- Reflow text ---
  const words = layoutAroundStars()

  ctx.font = bodyFont
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  for (const w of words) {
    // Tint words near stars
    let minDist = Infinity
    let nearestColor = '#c8c4be'
    for (const s of starBodies) {
      const dx = (w.x + w.width / 2) - s.body.position.x
      const dy = (w.y + lineHeight / 2) - s.body.position.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < minDist) {
        minDist = dist
        nearestColor = s.color
      }
    }
    const tint = Math.max(0, 1 - minDist / 80)
    if (tint > 0.05) {
      ctx.fillStyle = nearestColor
      ctx.globalAlpha = 0.4 + (1 - tint) * 0.6
    } else {
      ctx.fillStyle = '#b8b4ae'
      ctx.globalAlpha = 0.85
    }
    ctx.fillText(w.text, w.x, w.y)
  }
  ctx.globalAlpha = 1

  // --- Draw stars ---
  for (const s of starBodies) {
    const b = s.body
    // Outer glow
    const glow = ctx.createRadialGradient(b.position.x, b.position.y, starRadius * 0.5, b.position.x, b.position.y, starRadius * 3)
    glow.addColorStop(0, s.color + '30')
    glow.addColorStop(1, 'transparent')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(b.position.x, b.position.y, starRadius * 3, 0, Math.PI * 2)
    ctx.fill()

    // Star body
    const grad = ctx.createRadialGradient(b.position.x - 2, b.position.y - 2, 1, b.position.x, b.position.y, starRadius)
    grad.addColorStop(0, '#fff')
    grad.addColorStop(0.4, s.color)
    grad.addColorStop(1, s.color + '66')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(b.position.x, b.position.y, starRadius, 0, Math.PI * 2)
    ctx.fill()
  }

  // Caption
  ctx.font = 'italic 11px Georgia, "Times New Roman", serif'
  ctx.fillStyle = '#3a3a5a'
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'center'
  ctx.fillText('layoutNextLine() reflows text around orbiting stars — drag any star to rearrange the constellation', W / 2, H - 12)

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
