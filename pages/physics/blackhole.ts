import { prepareWithSegments, layoutNextLine, type LayoutCursor } from '../../src/layout.js'
import { createWorld, createBody, step } from '../../src/physics/index.js'
import type { Body } from '../../src/physics/types.js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const dpr = window.devicePixelRatio || 1

const W = Math.min(900, window.innerWidth - 48)
const H = 680
canvas.width = W * dpr
canvas.height = H * dpr
canvas.style.width = `${W}px`
canvas.style.height = `${H}px`
ctx.scale(dpr, dpr)

const bodyFont = '16px Georgia, "Times New Roman", serif'
const lineHeight = 24
const marginX = 40
const textStartY = 40

const documentText = `Nothing escapes a black hole — not light, not time, not meaning. At the event horizon, spacetime curves so violently that all paths lead inward. From the outside, a falling object appears to freeze at the boundary, its light reddening into infinity, an eternal postcard from the edge of oblivion. But from the inside, the fall is swift and total. The singularity is not a place; it is a moment in the future that all worldlines converge upon. It is the period at the end of every sentence space can write. What happens to information that crosses the horizon? Hawking said it radiates back, scrambled beyond recognition. Others say it encodes on the surface like words pressed into glass. The holographic principle suggests our three-dimensional experience may be a projection from a two-dimensional boundary. Perhaps you are already inside a black hole, reading these words from a surface that only looks like depth. The text around this singularity bends for the same reason you do: gravity is geometry, and geometry does not negotiate.`

const prepared = prepareWithSegments(documentText, bodyFont)
const internalWidths: number[] = (prepared as any).widths
const segments: string[] = prepared.segments

// --- Black hole center ---
let bhX = W / 2
let bhY = H / 2
let targetBhX = bhX
let targetBhY = bhY
const EVENT_HORIZON = 40
const INFLUENCE_RADIUS = 180

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect()
  targetBhX = e.clientX - rect.left
  targetBhY = e.clientY - rect.top
})

// --- Accretion disk particles (characters orbiting the black hole) ---
const world = createWorld({
  gravity: { x: 0, y: 0 },
  iterations: 2,
  damping: 0.995,
})

type AccretionChar = {
  body: Body
  angle: number
  radius: number
  speed: number
  char: string
  alpha: number
}

const accretionChars: AccretionChar[] = []
const sampleChars = 'abcdefghijklmnopqrstuvwxyz.,-;:!?ABCDEFGHIJKLMNOPQRST'

for (let i = 0; i < 40; i++) {
  const angle = Math.random() * Math.PI * 2
  const radius = EVENT_HORIZON + 5 + Math.random() * 60
  const char = sampleChars[Math.floor(Math.random() * sampleChars.length)]!
  const speed = 2 + Math.random() * 3

  const body = createBody(world, char, bodyFont, {
    position: {
      x: bhX + Math.cos(angle) * radius,
      y: bhY + Math.sin(angle) * radius,
    },
    mass: 0.2,
    width: 10,
    height: 10,
    friction: 0,
    collisionGroup: i + 10,
  })

  accretionChars.push({ body, angle, radius, speed, char, alpha: 0.3 + Math.random() * 0.5 })
}

// --- Text layout with black hole exclusion ---
type PositionedWord = { text: string; x: number; y: number; width: number }

function layoutAroundBlackHole(): PositionedWord[] {
  const words: PositionedWord[] = []
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let lineTop = textStartY
  const regionLeft = marginX
  const regionRight = W - marginX

  while (lineTop + lineHeight < H - 30) {
    const bandMid = lineTop + lineHeight / 2
    const blocked: { left: number; right: number }[] = []

    // Black hole exclusion zone (circular)
    const dy = bandMid - bhY
    const distFromCenter = Math.abs(dy)
    if (distFromCenter < INFLUENCE_RADIUS) {
      const halfChord = Math.sqrt(INFLUENCE_RADIUS * INFLUENCE_RADIUS - dy * dy)
      blocked.push({
        left: bhX - halfChord,
        right: bhX + halfChord,
      })
    }

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

    const slots: { left: number; right: number }[] = []
    let slotLeft = regionLeft
    for (const b of merged) {
      if (b.left > slotLeft) slots.push({ left: slotLeft, right: b.left })
      slotLeft = Math.max(slotLeft, b.right)
    }
    if (slotLeft < regionRight) slots.push({ left: slotLeft, right: regionRight })

    if (slots.length === 0) { lineTop += lineHeight; continue }

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

// --- Render ---
let lastTime = performance.now()
let time = 0

function frame(now: number) {
  const elapsed = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now
  time += elapsed

  // Move black hole toward target
  bhX += (targetBhX - bhX) * elapsed * 3
  bhY += (targetBhY - bhY) * elapsed * 3

  // Accretion disk — orbit characters around center
  for (const ac of accretionChars) {
    ac.angle += ac.speed * elapsed
    // Slowly spiral inward
    ac.radius -= elapsed * 2
    if (ac.radius < EVENT_HORIZON * 0.6) {
      ac.radius = EVENT_HORIZON + 10 + Math.random() * 55
      ac.alpha = 0.3 + Math.random() * 0.5
    }
    ac.body.position.x = bhX + Math.cos(ac.angle) * ac.radius
    ac.body.position.y = bhY + Math.sin(ac.angle) * ac.radius
    // Fade as they approach
    ac.alpha = Math.max(0.1, (ac.radius - EVENT_HORIZON * 0.6) / 60)
  }

  step(world, elapsed)

  // --- Render ---
  ctx.clearRect(0, 0, W, H)

  // Gravitational lensing rings
  for (let ring = 3; ring >= 1; ring--) {
    const r = EVENT_HORIZON + ring * 40
    const alpha = 0.03 + ring * 0.01
    ctx.strokeStyle = `rgba(255, 140, 0, ${alpha})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(bhX, bhY, r, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Accretion disk glow
  const diskGlow = ctx.createRadialGradient(bhX, bhY, EVENT_HORIZON, bhX, bhY, EVENT_HORIZON + 70)
  diskGlow.addColorStop(0, 'rgba(255, 100, 0, 0.08)')
  diskGlow.addColorStop(0.5, 'rgba(255, 60, 0, 0.04)')
  diskGlow.addColorStop(1, 'transparent')
  ctx.fillStyle = diskGlow
  ctx.beginPath()
  ctx.arc(bhX, bhY, EVENT_HORIZON + 70, 0, Math.PI * 2)
  ctx.fill()

  // Accretion disk characters
  ctx.font = '12px Georgia, serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (const ac of accretionChars) {
    const distFromEH = ac.radius - EVENT_HORIZON * 0.6
    const redshift = Math.max(0, 1 - distFromEH / 80)
    const r = Math.round(200 + redshift * 55)
    const g = Math.round(150 - redshift * 100)
    const b = Math.round(100 - redshift * 100)
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${ac.alpha})`
    ctx.save()
    ctx.translate(ac.body.position.x, ac.body.position.y)
    // Stretch tangentially
    const stretch = 1 + redshift * 0.5
    ctx.scale(stretch, 1 / stretch)
    ctx.fillText(ac.char, 0, 0)
    ctx.restore()
  }

  // Event horizon (solid black circle)
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.arc(bhX, bhY, EVENT_HORIZON, 0, Math.PI * 2)
  ctx.fill()

  // Photon ring (thin bright ring at the event horizon)
  const photonRing = ctx.createRadialGradient(bhX, bhY, EVENT_HORIZON - 3, bhX, bhY, EVENT_HORIZON + 4)
  photonRing.addColorStop(0, 'transparent')
  photonRing.addColorStop(0.4, 'rgba(255, 180, 50, 0.4)')
  photonRing.addColorStop(0.6, 'rgba(255, 120, 0, 0.6)')
  photonRing.addColorStop(0.8, 'rgba(255, 80, 0, 0.3)')
  photonRing.addColorStop(1, 'transparent')
  ctx.fillStyle = photonRing
  ctx.beginPath()
  ctx.arc(bhX, bhY, EVENT_HORIZON + 4, 0, Math.PI * 2)
  ctx.fill()

  // --- Reflow text ---
  const words = layoutAroundBlackHole()

  ctx.font = bodyFont
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  for (const w of words) {
    const wx = w.x + w.width / 2
    const wy = w.y + lineHeight / 2
    const dx = wx - bhX
    const dy = wy - bhY
    const dist = Math.sqrt(dx * dx + dy * dy)

    // Gravitational redshift — text near the hole goes orange/dim
    const proximity = Math.max(0, 1 - dist / INFLUENCE_RADIUS)
    const r = Math.round(180 + proximity * 75)
    const g = Math.round(176 - proximity * 80)
    const b = Math.round(170 - proximity * 120)
    const alpha = Math.max(0.3, 1 - proximity * 0.6)

    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`

    // Subtle skew toward the hole for words near it
    if (proximity > 0.3) {
      ctx.save()
      const angle = Math.atan2(dy, dx)
      const skew = proximity * 0.15
      ctx.translate(w.x, w.y)
      ctx.transform(1, Math.sin(angle) * skew, -Math.cos(angle) * skew, 1, 0, 0)
      ctx.fillText(w.text, 0, 0)
      ctx.restore()
    } else {
      ctx.fillText(w.text, w.x, w.y)
    }
  }

  // Hawking radiation particles (faint, escaping outward)
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  for (let i = 0; i < 8; i++) {
    const angle = time * 0.3 + i * (Math.PI * 2 / 8)
    const dist = EVENT_HORIZON + 5 + Math.sin(time * 2 + i) * 3
    const px = bhX + Math.cos(angle) * dist
    const py = bhY + Math.sin(angle) * dist
    const flicker = Math.sin(time * 5 + i * 2) * 0.5 + 0.5
    ctx.fillStyle = `rgba(200, 220, 255, ${flicker * 0.15})`
    ctx.beginPath()
    ctx.arc(px, py, 1.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // Caption
  ctx.font = 'italic 11px Georgia, "Times New Roman", serif'
  ctx.fillStyle = '#5a4a30'
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'center'
  ctx.fillText('layoutNextLine() reflows text around a black hole — click to move the singularity', W / 2, H - 12)

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
