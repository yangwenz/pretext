import { prepareWithSegments, layoutNextLine, type LayoutCursor } from '../../src/layout.js'

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

// --- Text setup ---
const bodyFont = '16px Georgia, "Times New Roman", serif'
const lineHeight = 24
const marginX = 36
const textStartY = 30

const documentText = `Water does not resist. Water flows. When you plunge your hand into it, all you feel is a caress. Water is not a solid wall, it will not stop you. But water always goes where it wants to go, and nothing in the end can stand against it. Water is patient. Dripping water wears away a stone. Remember that, my child. Remember you are half water. If you can't go through an obstacle, go around it. Water does. Water is the softest thing, yet it can penetrate mountains and earth. This shows clearly the principle of softness overcoming hardness. The highest good is like water. Water gives life to the ten thousand things and does not strive. It flows in places men reject and so is like the Tao. In dwelling, be close to the land. In meditation, go deep in the heart. In dealing with others, be gentle and kind. In speech, be true. In ruling, be just. In daily life, be competent. In action, be aware of the timing. Nothing is softer or more flexible than water, yet nothing can resist it. Empty your mind, be formless, shapeless — like water. If you put water into a cup, it becomes the cup. You put water into a bottle, it becomes the bottle. You put it in a teapot, it becomes the teapot. Now, water can flow or it can crash. Be water, my friend.`

const prepared = prepareWithSegments(documentText, bodyFont)
const internalWidths: number[] = (prepared as any).widths
const segments: string[] = prepared.segments

// --- River geometry ---
// The river flows top-to-bottom through the center, with wavy left and right banks
const RIVER_CENTER_X = W / 2
const RIVER_BASE_WIDTH = 100 // half-width of the river at rest

const WAVE_POINTS = 80 // points along the vertical axis
// Left bank offsets (negative = further left from center)
const leftBank: number[] = new Array(WAVE_POINTS).fill(0)
const leftBankVel: number[] = new Array(WAVE_POINTS).fill(0)
// Right bank offsets (positive = further right from center)
const rightBank: number[] = new Array(WAVE_POINTS).fill(0)
const rightBankVel: number[] = new Array(WAVE_POINTS).fill(0)

const WAVE_TENSION = 0.02
const WAVE_DAMPING = 0.97
const WAVE_SPREAD = 0.2

// --- Bubbles ---
type Bubble = { x: number; y: number; radius: number; speed: number; wobble: number; life: number }
const bubbles: Bubble[] = []

function spawnBubble(x: number, y: number) {
  bubbles.push({
    x: x + (Math.random() - 0.5) * 15,
    y,
    radius: 1 + Math.random() * 2.5,
    speed: 40 + Math.random() * 60,
    wobble: Math.random() * Math.PI * 2,
    life: 0,
  })
}

// --- Flow particles (drifting downstream) ---
type FlowParticle = { x: number; y: number; speed: number; alpha: number; size: number }
const flowParticles: FlowParticle[] = []
for (let i = 0; i < 30; i++) {
  flowParticles.push({
    x: RIVER_CENTER_X + (Math.random() - 0.5) * RIVER_BASE_WIDTH * 1.5,
    y: Math.random() * H,
    speed: 30 + Math.random() * 50,
    alpha: 0.05 + Math.random() * 0.1,
    size: 1 + Math.random() * 2,
  })
}

// Get bank positions at a given Y
function getLeftBankAt(y: number): number {
  const t = (y / H) * (WAVE_POINTS - 1)
  const i = Math.floor(t)
  const f = t - i
  const a = leftBank[Math.max(0, Math.min(WAVE_POINTS - 1, i))]!
  const b = leftBank[Math.max(0, Math.min(WAVE_POINTS - 1, i + 1))]!
  return RIVER_CENTER_X - RIVER_BASE_WIDTH + a * (1 - f) + b * f
}

function getRightBankAt(y: number): number {
  const t = (y / H) * (WAVE_POINTS - 1)
  const i = Math.floor(t)
  const f = t - i
  const a = rightBank[Math.max(0, Math.min(WAVE_POINTS - 1, i))]!
  const b = rightBank[Math.max(0, Math.min(WAVE_POINTS - 1, i + 1))]!
  return RIVER_CENTER_X + RIVER_BASE_WIDTH + a * (1 - f) + b * f
}

function splashAt(y: number, strength: number) {
  const idx = Math.round((y / H) * (WAVE_POINTS - 1))
  const clampedIdx = Math.max(0, Math.min(WAVE_POINTS - 1, idx))
  leftBankVel[clampedIdx]! += strength
  rightBankVel[clampedIdx]! -= strength
  if (clampedIdx > 0) {
    leftBankVel[clampedIdx - 1]! += strength * 0.5
    rightBankVel[clampedIdx - 1]! -= strength * 0.5
  }
  if (clampedIdx < WAVE_POINTS - 1) {
    leftBankVel[clampedIdx + 1]! += strength * 0.5
    rightBankVel[clampedIdx + 1]! -= strength * 0.5
  }
}

// --- Click/drag interaction ---
let isDragging = false

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const lBank = getLeftBankAt(my)
  const rBank = getRightBankAt(my)
  if (mx > lBank - 30 && mx < rBank + 30) {
    splashAt(my, -15 - Math.random() * 10)
    for (let i = 0; i < 5; i++) {
      spawnBubble(lBank + Math.random() * (rBank - lBank), my)
    }
  }
})

canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const lBank = getLeftBankAt(my)
  const rBank = getRightBankAt(my)
  if (mx > lBank - 30 && mx < rBank + 30) {
    isDragging = true
  }
})

canvas.addEventListener('mousemove', (e) => {
  if (!isDragging) return
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  // Push banks outward from mouse
  const lBank = getLeftBankAt(my)
  const rBank = getRightBankAt(my)
  if (mx < RIVER_CENTER_X) {
    const push = Math.min(0, mx - lBank) * 0.3
    splashAt(my, push - 3)
  } else {
    const push = Math.max(0, mx - rBank) * 0.3
    splashAt(my, push + 3)
  }
  if (Math.random() < 0.3) {
    spawnBubble(mx, my)
  }
})

canvas.addEventListener('mouseup', () => { isDragging = false })
canvas.addEventListener('mouseleave', () => { isDragging = false })

// --- Per-word positioned layout (two columns around river) ---
type PositionedWord = { text: string; x: number; y: number; width: number }

function layoutAroundRiver(): PositionedWord[] {
  const words: PositionedWord[] = []
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let lineTop = textStartY

  while (lineTop + lineHeight < H - 20) {
    const bandMid = lineTop + lineHeight / 2
    const lBank = getLeftBankAt(bandMid)
    const rBank = getRightBankAt(bandMid)

    // Left column: from marginX to left bank
    const leftWidth = lBank - marginX - 8
    // Right column: from right bank to W - marginX
    const rightWidth = (W - marginX) - rBank - 8

    // Fill left column
    if (leftWidth >= 40) {
      const line = layoutNextLine(prepared, cursor, leftWidth)
      if (line === null) break

      let x = marginX
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

    // Fill right column (continues from same cursor — single flowing text)
    if (rightWidth >= 40) {
      const line = layoutNextLine(prepared, cursor, rightWidth)
      if (line === null) break

      let x = rBank + 8
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

    lineTop += lineHeight
  }

  return words
}

// --- Render loop ---
let lastTime = performance.now()
let time = 0

function frame(now: number) {
  const elapsed = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now
  time += elapsed

  // --- Wave simulation for both banks ---
  for (let i = 0; i < WAVE_POINTS; i++) {
    // Left bank
    let accelL = -WAVE_TENSION * leftBank[i]!
    if (i > 0) accelL += WAVE_SPREAD * (leftBank[i - 1]! - leftBank[i]!)
    if (i < WAVE_POINTS - 1) accelL += WAVE_SPREAD * (leftBank[i + 1]! - leftBank[i]!)
    leftBankVel[i]! += accelL
    leftBankVel[i]! *= WAVE_DAMPING

    // Right bank
    let accelR = -WAVE_TENSION * rightBank[i]!
    if (i > 0) accelR += WAVE_SPREAD * (rightBank[i - 1]! - rightBank[i]!)
    if (i < WAVE_POINTS - 1) accelR += WAVE_SPREAD * (rightBank[i + 1]! - rightBank[i]!)
    rightBankVel[i]! += accelR
    rightBankVel[i]! *= WAVE_DAMPING
  }
  for (let i = 0; i < WAVE_POINTS; i++) {
    leftBank[i]! += leftBankVel[i]!
    leftBank[i] = Math.max(-50, Math.min(50, leftBank[i]!))
    rightBank[i]! += rightBankVel[i]!
    rightBank[i] = Math.max(-50, Math.min(50, rightBank[i]!))
  }

  // Ambient wave (flowing downstream illusion)
  for (let i = 0; i < WAVE_POINTS; i++) {
    const drift = time * 2.0 // flow speed
    const ambientL =
      Math.sin(drift + i * 0.25) * 0.5 +
      Math.sin(drift * 0.7 + i * 0.15) * 0.3
    const ambientR =
      Math.sin(drift + i * 0.25 + 1.5) * 0.5 +
      Math.sin(drift * 0.7 + i * 0.15 + 2.0) * 0.3
    leftBank[i]! += ambientL * 0.04
    rightBank[i]! += ambientR * 0.04
  }

  // Update bubbles (float upward in water)
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]!
    b.life += elapsed
    b.y += b.speed * elapsed // flow downstream
    b.x += Math.sin(b.wobble + b.life * 3) * 0.5
    if (b.y > H + 10 || b.life > 4) {
      bubbles.splice(i, 1)
    }
  }

  // Update flow particles
  for (const p of flowParticles) {
    p.y += p.speed * elapsed
    if (p.y > H + 10) {
      p.y = -5
      p.x = RIVER_CENTER_X + (Math.random() - 0.5) * RIVER_BASE_WIDTH * 1.5
    }
    // Keep inside banks
    const lBank = getLeftBankAt(p.y)
    const rBank = getRightBankAt(p.y)
    if (p.x < lBank + 5) p.x = lBank + 5
    if (p.x > rBank - 5) p.x = rBank - 5
  }

  // --- Render ---
  ctx.clearRect(0, 0, W, H)

  // --- Draw river body ---
  ctx.beginPath()
  // Left bank (top to bottom)
  for (let i = 0; i <= WAVE_POINTS; i++) {
    const y = (i / WAVE_POINTS) * H
    const x = i < WAVE_POINTS ? RIVER_CENTER_X - RIVER_BASE_WIDTH + leftBank[i]! : RIVER_CENTER_X - RIVER_BASE_WIDTH + leftBank[WAVE_POINTS - 1]!
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  // Right bank (bottom to top)
  for (let i = WAVE_POINTS; i >= 0; i--) {
    const y = (i / WAVE_POINTS) * H
    const x = i < WAVE_POINTS ? RIVER_CENTER_X + RIVER_BASE_WIDTH + rightBank[i]! : RIVER_CENTER_X + RIVER_BASE_WIDTH + rightBank[WAVE_POINTS - 1]!
    ctx.lineTo(x, y)
  }
  ctx.closePath()

  const riverGrad = ctx.createLinearGradient(RIVER_CENTER_X - RIVER_BASE_WIDTH - 30, 0, RIVER_CENTER_X + RIVER_BASE_WIDTH + 30, 0)
  riverGrad.addColorStop(0, 'rgba(3, 30, 65, 0.75)')
  riverGrad.addColorStop(0.3, 'rgba(5, 45, 90, 0.85)')
  riverGrad.addColorStop(0.5, 'rgba(4, 35, 75, 0.9)')
  riverGrad.addColorStop(0.7, 'rgba(5, 45, 90, 0.85)')
  riverGrad.addColorStop(1, 'rgba(3, 30, 65, 0.75)')
  ctx.fillStyle = riverGrad
  ctx.fill()

  // --- Caustic light rays in river ---
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.beginPath()
  for (let i = 0; i <= WAVE_POINTS; i++) {
    const y = (i / WAVE_POINTS) * H
    const x = i < WAVE_POINTS ? RIVER_CENTER_X - RIVER_BASE_WIDTH + leftBank[i]! : RIVER_CENTER_X - RIVER_BASE_WIDTH + leftBank[WAVE_POINTS - 1]!
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  for (let i = WAVE_POINTS; i >= 0; i--) {
    const y = (i / WAVE_POINTS) * H
    const x = i < WAVE_POINTS ? RIVER_CENTER_X + RIVER_BASE_WIDTH + rightBank[i]! : RIVER_CENTER_X + RIVER_BASE_WIDTH + rightBank[WAVE_POINTS - 1]!
    ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.clip()

  for (let i = 0; i < 5; i++) {
    const phase = time * 0.5 + i * 1.4
    const cy = H * (0.1 + i * 0.2) + Math.sin(phase) * 15
    const grad = ctx.createRadialGradient(RIVER_CENTER_X + Math.sin(phase * 0.8) * 20, cy, 5, RIVER_CENTER_X, cy, RIVER_BASE_WIDTH)
    grad.addColorStop(0, `rgba(60, 180, 255, ${0.05 + Math.sin(phase) * 0.025})`)
    grad.addColorStop(0.6, `rgba(30, 120, 200, ${0.02 + Math.sin(phase * 1.2) * 0.01})`)
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = grad
    ctx.fillRect(RIVER_CENTER_X - RIVER_BASE_WIDTH - 50, cy - 40, RIVER_BASE_WIDTH * 2 + 100, 80)
  }
  ctx.restore()

  // --- Draw bank edges ---
  // Left bank
  ctx.beginPath()
  for (let i = 0; i <= WAVE_POINTS; i++) {
    const y = (i / WAVE_POINTS) * H
    const x = RIVER_CENTER_X - RIVER_BASE_WIDTH + leftBank[Math.min(i, WAVE_POINTS - 1)]!
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  const bankGradL = ctx.createLinearGradient(0, 0, 0, H)
  bankGradL.addColorStop(0, 'rgba(79, 195, 247, 0.4)')
  bankGradL.addColorStop(0.5, 'rgba(129, 212, 250, 0.6)')
  bankGradL.addColorStop(1, 'rgba(79, 195, 247, 0.4)')
  ctx.strokeStyle = bankGradL
  ctx.lineWidth = 2
  ctx.stroke()

  // Right bank
  ctx.beginPath()
  for (let i = 0; i <= WAVE_POINTS; i++) {
    const y = (i / WAVE_POINTS) * H
    const x = RIVER_CENTER_X + RIVER_BASE_WIDTH + rightBank[Math.min(i, WAVE_POINTS - 1)]!
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = bankGradL
  ctx.lineWidth = 2
  ctx.stroke()

  // --- Flow particles ---
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  for (const p of flowParticles) {
    ctx.fillStyle = `rgba(140, 210, 255, ${p.alpha})`
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // --- Reflow text into two columns around river ---
  const words = layoutAroundRiver()

  ctx.font = bodyFont
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  for (const w of words) {
    const midX = w.x + w.width / 2
    const midY = w.y + lineHeight / 2
    // Determine distance to nearest bank
    const lBank = getLeftBankAt(midY)
    const rBank = getRightBankAt(midY)
    let distToBank: number
    if (midX < RIVER_CENTER_X) {
      distToBank = lBank - (w.x + w.width)
    } else {
      distToBank = w.x - rBank
    }
    const fade = Math.min(1, Math.max(0.35, distToBank / 30))
    const blueTint = Math.max(0, 1 - distToBank / 50)
    const r = Math.round(200 - blueTint * 45)
    const g = Math.round(196 + blueTint * 20)
    const b = Math.round(190 + blueTint * 50)
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${fade})`
    ctx.fillText(w.text, w.x, w.y)
  }

  // --- Draw bubbles ---
  for (const b of bubbles) {
    const fadeIn = Math.min(1, b.life * 4)
    const alpha = fadeIn * 0.5
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(150, 220, 255, ${alpha})`
    ctx.lineWidth = 0.8
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(b.x - b.radius * 0.3, b.y - b.radius * 0.3, b.radius * 0.3, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(200, 240, 255, ${alpha * 0.5})`
    ctx.fill()
  }

  // --- Caption ---
  ctx.font = 'italic 11px Georgia, "Times New Roman", serif'
  ctx.fillStyle = '#3a5570'
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'center'
  ctx.fillText('layoutNextLine() flows text into two columns around a river — click or drag the water', W / 2, H - 12)

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
