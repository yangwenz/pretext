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

const documentText = `The spiral is nature's favorite shape. Galaxies spin, hurricanes turn, water drains in a vortex. Even DNA twists in a helix. At the center of every spiral is stillness — the eye of the storm, the singularity, the point where all motion converges to nothing. These words are caught in the same pattern now, flowing around an invisible force that distorts the space they occupy. A vortex does not destroy; it rearranges. The same letters, the same meaning, but pulled into new geometries by rotation. Watch how the paragraph bends — each line finding its available width diminished or expanded as the spinning mass passes through. This is what it means to read in a storm: the words survive intact, but their shape on the page tells you something about the forces at work in the world around them.`

const prepared = prepareWithSegments(documentText, bodyFont)
const internalWidths: number[] = (prepared as any).widths
const segments: string[] = prepared.segments

// --- Vortex physics (a cluster of spinning bodies) ---
const world = createWorld({
  gravity: { x: 0, y: 0 },
  bounds: { x: 30, y: 30, width: W - 60, height: H - 60 },
  iterations: 4,
  damping: 0.998,
  sleepThresholdVel: 0.1,
  sleepDelay: 200,
})

const CX = W / 2
const CY = H / 2
const VORTEX_BODY_COUNT = 8
const VORTEX_RADIUS = 50

type VortexBody = { body: Body; orbitRadius: number; phase: number; speed: number; color: string }
const vortexBodies: VortexBody[] = []

const vortexColors = ['#c77dff', '#9d4edd', '#7b2ff7', '#5a189a', '#e0aaff', '#b185db', '#7b2ff7', '#6c63ff']

for (let i = 0; i < VORTEX_BODY_COUNT; i++) {
  const phase = (i / VORTEX_BODY_COUNT) * Math.PI * 2
  const orbitR = 30 + (i % 3) * 25
  const speed = 1.5 + (i % 4) * 0.3
  const bx = CX + Math.cos(phase) * orbitR
  const by = CY + Math.sin(phase) * orbitR
  const r = 8 + (i % 3) * 4

  const body = createBody(world, '●', bodyFont, {
    position: { x: bx, y: by },
    mass: 2,
    width: r * 2,
    height: r * 2,
    restitution: 0.9,
    friction: 0,
    collisionGroup: 0,
  })

  vortexBodies.push({
    body,
    orbitRadius: orbitR,
    phase,
    speed,
    color: vortexColors[i]!,
  })
}

// --- Click to move vortex center ---
let targetCX = CX
let targetCY = CY
let currentCX = CX
let currentCY = CY

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect()
  targetCX = e.clientX - rect.left
  targetCY = e.clientY - rect.top
})

// --- Dust particles for visual ---
type Dust = { angle: number; radius: number; speed: number; size: number; alpha: number }
const dustParticles: Dust[] = []
for (let i = 0; i < 50; i++) {
  dustParticles.push({
    angle: Math.random() * Math.PI * 2,
    radius: 20 + Math.random() * 120,
    speed: 0.5 + Math.random() * 1.5,
    size: 0.5 + Math.random() * 1.5,
    alpha: 0.1 + Math.random() * 0.2,
  })
}

// --- Text layout around vortex bodies ---
type PositionedWord = { text: string; x: number; y: number; width: number }

function layoutAroundVortex(): PositionedWord[] {
  const words: PositionedWord[] = []
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let lineTop = textStartY
  const regionLeft = marginX
  const regionRight = W - marginX

  while (lineTop + lineHeight < H - 30) {
    const bandTop = lineTop
    const bandBottom = lineTop + lineHeight

    // Find vortex bodies overlapping this line band
    const blocked: { left: number; right: number }[] = []
    for (const v of vortexBodies) {
      const r = v.body.width / 2
      const bodyTop = v.body.position.y - r - 4
      const bodyBottom = v.body.position.y + r + 4
      if (bodyBottom > bandTop && bodyTop < bandBottom) {
        blocked.push({
          left: v.body.position.x - r - 8,
          right: v.body.position.x + r + 8,
        })
      }
    }

    // Also block a distortion zone near the vortex center
    const distToCenterY = Math.abs((lineTop + lineHeight / 2) - currentCY)
    if (distToCenterY < VORTEX_RADIUS + 20) {
      const distortionWidth = (VORTEX_RADIUS + 20 - distToCenterY) * 1.5
      blocked.push({
        left: currentCX - distortionWidth,
        right: currentCX + distortionWidth,
      })
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

  // Smoothly move vortex center toward target
  currentCX += (targetCX - currentCX) * elapsed * 2
  currentCY += (targetCY - currentCY) * elapsed * 2

  // Orbital forces for vortex bodies
  for (const v of vortexBodies) {
    if (v.body.mass === Infinity) continue
    const dx = currentCX - v.body.position.x
    const dy = currentCY - v.body.position.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    // Centripetal pull
    const pullStrength = 15
    v.body.force.x += dx * pullStrength
    v.body.force.y += dy * pullStrength
    // Tangential spinning
    const tangentX = -dy / dist
    const tangentY = dx / dist
    v.body.force.x += tangentX * v.speed * 200
    v.body.force.y += tangentY * v.speed * 200
    v.body.sleeping = false
    v.body.sleepTimer = 0
  }

  let steps = 0
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    step(world, FIXED_DT)
    accumulator -= FIXED_DT
    steps++
  }

  // Update dust
  for (const d of dustParticles) {
    d.angle += d.speed * elapsed
    d.radius += Math.sin(time + d.angle) * elapsed * 5
    if (d.radius < 15) d.radius = 15
    if (d.radius > 140) d.radius = 140
  }

  // --- Render ---
  ctx.clearRect(0, 0, W, H)

  // Vortex background glow
  const vGlow = ctx.createRadialGradient(currentCX, currentCY, 10, currentCX, currentCY, 200)
  vGlow.addColorStop(0, 'rgba(123, 47, 247, 0.12)')
  vGlow.addColorStop(0.3, 'rgba(80, 30, 180, 0.06)')
  vGlow.addColorStop(0.7, 'rgba(40, 15, 100, 0.02)')
  vGlow.addColorStop(1, 'transparent')
  ctx.fillStyle = vGlow
  ctx.fillRect(0, 0, W, H)

  // Spiral arms
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  for (let arm = 0; arm < 4; arm++) {
    ctx.beginPath()
    const armOffset = (arm / 4) * Math.PI * 2
    for (let i = 0; i < 80; i++) {
      const t = i / 80
      const spiralAngle = armOffset + time * 2 + t * Math.PI * 5
      const r = 15 + t * 150
      const sx = currentCX + Math.cos(spiralAngle) * r
      const sy = currentCY + Math.sin(spiralAngle) * r
      if (i === 0) ctx.moveTo(sx, sy)
      else ctx.lineTo(sx, sy)
    }
    ctx.strokeStyle = `rgba(150, 100, 255, 0.04)`
    ctx.lineWidth = 2.5
    ctx.stroke()
  }
  ctx.restore()

  // Dust
  for (const d of dustParticles) {
    const dx = currentCX + Math.cos(d.angle) * d.radius
    const dy = currentCY + Math.sin(d.angle) * d.radius
    ctx.fillStyle = `rgba(180, 140, 255, ${d.alpha})`
    ctx.beginPath()
    ctx.arc(dx, dy, d.size, 0, Math.PI * 2)
    ctx.fill()
  }

  // --- Reflow text around vortex ---
  const words = layoutAroundVortex()

  ctx.font = bodyFont
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  for (const w of words) {
    const wx = w.x + w.width / 2
    const wy = w.y + lineHeight / 2
    const dx = wx - currentCX
    const dy = wy - currentCY
    const dist = Math.sqrt(dx * dx + dy * dy)
    const t = Math.max(0, 1 - dist / 200)
    // Color shifts toward purple near vortex
    const r = Math.round(200 - t * 60)
    const g = Math.round(196 - t * 80)
    const b = Math.round(190 + t * 60)
    const alpha = Math.max(0.5, 1 - t * 0.3)
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
    ctx.fillText(w.text, w.x, w.y)
  }

  // --- Draw vortex bodies ---
  for (const v of vortexBodies) {
    const b = v.body
    const r = b.width / 2
    // Glow
    const glow = ctx.createRadialGradient(b.position.x, b.position.y, r * 0.3, b.position.x, b.position.y, r * 2.5)
    glow.addColorStop(0, v.color + '40')
    glow.addColorStop(1, 'transparent')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(b.position.x, b.position.y, r * 2.5, 0, Math.PI * 2)
    ctx.fill()

    // Body
    const grad = ctx.createRadialGradient(b.position.x - 1, b.position.y - 1, 0, b.position.x, b.position.y, r)
    grad.addColorStop(0, '#fff')
    grad.addColorStop(0.3, v.color)
    grad.addColorStop(1, v.color + '88')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(b.position.x, b.position.y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Eye of the vortex
  const eyeGlow = ctx.createRadialGradient(currentCX, currentCY, 0, currentCX, currentCY, 15)
  eyeGlow.addColorStop(0, 'rgba(255, 255, 255, 0.2)')
  eyeGlow.addColorStop(0.5, 'rgba(200, 180, 255, 0.08)')
  eyeGlow.addColorStop(1, 'transparent')
  ctx.fillStyle = eyeGlow
  ctx.beginPath()
  ctx.arc(currentCX, currentCY, 15, 0, Math.PI * 2)
  ctx.fill()

  // Caption
  ctx.font = 'italic 11px Georgia, "Times New Roman", serif'
  ctx.fillStyle = '#3a2a5a'
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'center'
  ctx.fillText('layoutNextLine() reflows text around a spinning vortex — click anywhere to move the center', W / 2, H - 12)

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
