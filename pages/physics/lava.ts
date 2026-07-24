import { prepareWithSegments, layoutNextLine, type LayoutCursor } from '../../src/layout.js'
import { createWorld, createBody, step } from '../../src/physics/index.js'
import type { Body } from '../../src/physics/types.js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const dpr = window.devicePixelRatio || 1

const W = Math.min(800, window.innerWidth - 48)
const H = 700
canvas.width = W * dpr
canvas.height = H * dpr
canvas.style.width = `${W}px`
canvas.style.height = `${H}px`
ctx.scale(dpr, dpr)

const bodyFont = '15px Georgia, "Times New Roman", serif'
const lineHeight = 23
const marginX = 40
const textStartY = 30

const documentText = `A lava lamp is a meditation device disguised as decor. The blobs have no agenda — they rise when warm, sink when cool, merge when they meet, split when they stretch too thin. There is no purpose to their motion except to exist beautifully in time. The wax does not know it is being watched. It does not perform. It simply obeys thermodynamics with a grace that hypnotizes. We project meaning onto the shapes: that one looks like a thought forming, this one like a memory dissolving. But the lamp does not think. It just flows. Perhaps that is why we find it calming — it is the one object in the room that truly has nowhere to be. The heat rises, the wax follows, the cycle repeats. No deadline, no optimization, no narrative arc. Just the endless slow ballet of density and temperature, playing out in colored oil behind glass, while we pretend we are not jealous of its freedom.`

const prepared = prepareWithSegments(documentText, bodyFont)
const internalWidths: number[] = (prepared as any).widths
const segments: string[] = prepared.segments

// --- Lava blobs ---
const world = createWorld({
  gravity: { x: 0, y: 0 },
  iterations: 4,
  damping: 0.98,
  sleepThresholdVel: 0.1,
  sleepDelay: 100,
})

type Blob = {
  body: Body
  radius: number
  temperature: number // >0.5 rises, <0.5 sinks
  color: string
  wobblePhase: number
  wobbleSpeed: number
}

const blobs: Blob[] = []
const blobColors = ['#ff6b6b', '#feca57', '#ff9ff3', '#ff7f50', '#ff4757', '#ee5a24', '#f368e0']

const BLOB_COUNT = 7
for (let i = 0; i < BLOB_COUNT; i++) {
  const radius = 20 + Math.random() * 25
  const x = marginX + 60 + Math.random() * (W - marginX * 2 - 120)
  const y = 100 + Math.random() * (H - 200)
  const temp = Math.random()

  const body = createBody(world, '●', bodyFont, {
    position: { x, y },
    mass: 2,
    width: radius * 2,
    height: radius * 2,
    restitution: 0.3,
    friction: 0.1,
    collisionGroup: 0,
  })

  blobs.push({
    body,
    radius,
    temperature: temp,
    color: blobColors[i % blobColors.length]!,
    wobblePhase: Math.random() * Math.PI * 2,
    wobbleSpeed: 1 + Math.random() * 2,
  })
}

// Click to heat nearest blob
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top

  let nearest: Blob | null = null
  let nearestDist = Infinity
  for (const b of blobs) {
    const dx = mx - b.body.position.x
    const dy = my - b.body.position.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < nearestDist) {
      nearestDist = dist
      nearest = b
    }
  }
  if (nearest) {
    nearest.temperature = Math.min(1, nearest.temperature + 0.4)
  }
})

// --- Text layout around blobs ---
type PositionedWord = { text: string; x: number; y: number; width: number }

function layoutAroundBlobs(): PositionedWord[] {
  const words: PositionedWord[] = []
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let lineTop = textStartY
  const regionLeft = marginX
  const regionRight = W - marginX

  while (lineTop + lineHeight < H - 20) {
    const bandTop = lineTop
    const bandBottom = lineTop + lineHeight

    const blocked: { left: number; right: number }[] = []
    for (const b of blobs) {
      const blobTop = b.body.position.y - b.radius - 4
      const blobBot = b.body.position.y + b.radius + 4
      if (blobBot > bandTop && blobTop < bandBottom) {
        blocked.push({
          left: b.body.position.x - b.radius - 6,
          right: b.body.position.x + b.radius + 6,
        })
      }
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

// --- Render ---
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

  // Temperature dynamics
  for (const b of blobs) {
    // Cool/heat over time toward 0.5
    b.temperature += (0.5 - b.temperature) * elapsed * 0.15
    // Vertical force based on temperature
    const buoyancy = (b.temperature - 0.5) * -600
    b.body.force.y += buoyancy
    // Gentle horizontal centering
    const centerPull = (W / 2 - b.body.position.x) * 0.3
    b.body.force.x += centerPull
    // Confine vertically
    if (b.body.position.y < 30 + b.radius) {
      b.body.position.y = 30 + b.radius
      b.body.velocity.y = Math.abs(b.body.velocity.y) * 0.2
      b.temperature = Math.max(0.1, b.temperature - 0.05)
    }
    if (b.body.position.y > H - 30 - b.radius) {
      b.body.position.y = H - 30 - b.radius
      b.body.velocity.y = -Math.abs(b.body.velocity.y) * 0.2
      b.temperature = Math.min(0.9, b.temperature + 0.05)
    }
    // Confine horizontally
    if (b.body.position.x < marginX + b.radius) {
      b.body.position.x = marginX + b.radius
      b.body.velocity.x = Math.abs(b.body.velocity.x) * 0.3
    }
    if (b.body.position.x > W - marginX - b.radius) {
      b.body.position.x = W - marginX - b.radius
      b.body.velocity.x = -Math.abs(b.body.velocity.x) * 0.3
    }
    b.body.sleeping = false
    b.body.sleepTimer = 0
  }

  let steps = 0
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    step(world, FIXED_DT)
    accumulator -= FIXED_DT
    steps++
  }

  // --- Render ---
  ctx.clearRect(0, 0, W, H)

  // Warm gradient background at bottom
  const heatGrad = ctx.createLinearGradient(0, H - 80, 0, H)
  heatGrad.addColorStop(0, 'transparent')
  heatGrad.addColorStop(1, 'rgba(255, 60, 30, 0.04)')
  ctx.fillStyle = heatGrad
  ctx.fillRect(0, H - 80, W, 80)

  // Cool gradient at top
  const coolGrad = ctx.createLinearGradient(0, 0, 0, 60)
  coolGrad.addColorStop(0, 'rgba(60, 80, 200, 0.03)')
  coolGrad.addColorStop(1, 'transparent')
  ctx.fillStyle = coolGrad
  ctx.fillRect(0, 0, W, 60)

  // --- Reflow text ---
  const words = layoutAroundBlobs()

  ctx.font = bodyFont
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  for (const w of words) {
    let minDist = Infinity
    let nearColor = ''
    for (const b of blobs) {
      const dx = (w.x + w.width / 2) - b.body.position.x
      const dy = (w.y + lineHeight / 2) - b.body.position.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < minDist) {
        minDist = dist
        nearColor = b.color
      }
    }
    const tint = Math.max(0, 1 - minDist / 50)
    if (tint > 0.05) {
      ctx.fillStyle = nearColor
      ctx.globalAlpha = 0.4 + (1 - tint) * 0.5
    } else {
      ctx.fillStyle = '#b8b0a8'
      ctx.globalAlpha = 0.8
    }
    ctx.fillText(w.text, w.x, w.y)
  }
  ctx.globalAlpha = 1

  // --- Draw blobs ---
  for (const b of blobs) {
    const bx = b.body.position.x
    const by = b.body.position.y
    const wobble = Math.sin(time * b.wobbleSpeed + b.wobblePhase)
    const rx = b.radius * (1 + wobble * 0.08)
    const ry = b.radius * (1 - wobble * 0.08)

    // Outer glow
    const glow = ctx.createRadialGradient(bx, by, Math.min(rx, ry) * 0.5, bx, by, Math.max(rx, ry) * 2)
    glow.addColorStop(0, b.color + '30')
    glow.addColorStop(1, 'transparent')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.ellipse(bx, by, rx * 2, ry * 2, 0, 0, Math.PI * 2)
    ctx.fill()

    // Blob body
    const blobGrad = ctx.createRadialGradient(bx - rx * 0.25, by - ry * 0.25, 2, bx, by, Math.max(rx, ry))
    blobGrad.addColorStop(0, '#ffffff88')
    blobGrad.addColorStop(0.3, b.color + 'cc')
    blobGrad.addColorStop(0.7, b.color + 'aa')
    blobGrad.addColorStop(1, b.color + '44')
    ctx.fillStyle = blobGrad
    ctx.beginPath()
    ctx.ellipse(bx, by, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()

    // Temperature indicator — hot blobs glow brighter
    if (b.temperature > 0.6) {
      const hotGlow = ctx.createRadialGradient(bx, by, rx * 0.2, bx, by, rx * 1.3)
      const intensity = (b.temperature - 0.6) * 2.5
      hotGlow.addColorStop(0, `rgba(255, 200, 100, ${intensity * 0.2})`)
      hotGlow.addColorStop(1, 'transparent')
      ctx.fillStyle = hotGlow
      ctx.beginPath()
      ctx.ellipse(bx, by, rx * 1.3, ry * 1.3, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Caption
  ctx.font = 'italic 11px Georgia, "Times New Roman", serif'
  ctx.fillStyle = '#5a3a5a'
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'center'
  ctx.fillText('layoutNextLine() reflows text around floating blobs — click any blob to heat it', W / 2, H - 12)

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
