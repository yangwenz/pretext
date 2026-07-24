import { prepareWithSegments, layoutNextLine, type LayoutCursor } from '../../src/layout.js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const dpr = window.devicePixelRatio || 1

const W = Math.min(900, window.innerWidth - 48)
const H = 700
canvas.width = W * dpr
canvas.height = H * dpr
canvas.style.width = `${W}px`
canvas.style.height = `${H}px`
ctx.scale(dpr, dpr)

const bodyFont = '15px Georgia, "Times New Roman", serif'
const lineHeight = 22
const textPadding = 12

const documentText = `Time flows like sand through glass, each grain a moment passed. The narrow neck permits only one thought at a time — patience is the architecture of eternity. What falls cannot rise again, yet every ending is a beginning inverted. The hourglass knows no hurry; it simply lets gravity speak. In the upper chamber, words wait their turn, pressed together by the weight of all that must be said. Below, they accumulate in silence, building meaning grain by grain. The shape of the glass determines the rate of flow — narrow the passage, and each word gains weight. Widen it, and thoughts pour freely without pause. There is wisdom in constriction. A river forced through rock cuts deeper than a lake at rest. These words know this. They queue patiently, descend through the bottleneck of attention, and settle into the quiet archaeology of reading. Turn the glass over and it all begins again — the same words, rearranged by gravity into new configurations of meaning. Nothing is lost in the turning, only redistributed. Time does not run out; it simply changes chambers.`

const prepared = prepareWithSegments(documentText, bodyFont)
const internalWidths: number[] = (prepared as any).widths
const segments: string[] = prepared.segments

// --- Hourglass geometry ---
const CX = W / 2
const CY = H / 2
const NECK_RADIUS = 22
const BULB_RADIUS_X = W * 0.36
const BULB_HEIGHT = H * 0.37
const TOP = CY - BULB_HEIGHT
const BOT = CY + BULB_HEIGHT

function hourglassWidth(y: number): number {
  if (y < TOP || y > BOT) return 0
  const dy = Math.abs(y - CY)
  const t = dy / BULB_HEIGHT
  return NECK_RADIUS + (BULB_RADIUS_X - NECK_RADIUS) * t * t
}

// --- Sand grain physics (decorative falling grains) ---
type Grain = { x: number; y: number; vy: number; vx: number; char: string; alpha: number; angle: number; angVel: number }
const fallingGrains: Grain[] = []

// --- Drain state ---
let drainProgress = 0 // 0..1 how much text has "drained" to bottom
let flipped = false

function releaseGrain(charText: string, fromX: number, fromY: number) {
  fallingGrains.push({
    x: fromX + (Math.random() - 0.5) * 6,
    y: fromY,
    vy: 40 + Math.random() * 60,
    vx: (Math.random() - 0.5) * 20,
    char: charText,
    alpha: 0.8,
    angle: 0,
    angVel: (Math.random() - 0.5) * 3,
  })
}

canvas.addEventListener('click', () => {
  flipped = !flipped
  drainProgress = 0
})

// --- Layout text inside hourglass bulb ---
type PositionedWord = { text: string; x: number; y: number; width: number }

function layoutInBulb(startY: number, endY: number, cursorStart: { segmentIndex: number; graphemeIndex: number }, maxSegs: number): { words: PositionedWord[]; cursor: { segmentIndex: number; graphemeIndex: number } } {
  const words: PositionedWord[] = []
  let cursor: LayoutCursor = { ...cursorStart }
  let lineTop = startY
  let segsUsed = 0

  while (lineTop + lineHeight < endY) {
    const bandMid = lineTop + lineHeight / 2
    const halfW = hourglassWidth(bandMid)
    if (halfW < 30) {
      lineTop += lineHeight
      continue
    }
    const availWidth = (halfW - textPadding) * 2

    if (segsUsed >= maxSegs) break

    const line = layoutNextLine(prepared, cursor, availWidth)
    if (line === null) break

    const lineLeft = CX - halfW + textPadding
    let x = lineLeft
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
      segsUsed++
      if (segIdx > line.end.segmentIndex) break
      if (segIdx === line.end.segmentIndex && line.end.graphemeIndex === 0) break
    }

    cursor = line.end
    lineTop += lineHeight
  }

  return { words, cursor }
}

// Count total segments
const totalSegments = segments.length

// --- Draw hourglass outline ---
function drawHourglass() {
  ctx.beginPath()
  const steps = 80
  for (let i = 0; i <= steps; i++) {
    const y = TOP + (i / steps) * (BOT - TOP)
    const hw = hourglassWidth(y)
    const x = CX - hw
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  for (let i = steps; i >= 0; i--) {
    const y = TOP + (i / steps) * (BOT - TOP)
    const hw = hourglassWidth(y)
    ctx.lineTo(CX + hw, y)
  }
  ctx.closePath()

  const glassGrad = ctx.createLinearGradient(CX - BULB_RADIUS_X, 0, CX + BULB_RADIUS_X, 0)
  glassGrad.addColorStop(0, 'rgba(180, 140, 80, 0.08)')
  glassGrad.addColorStop(0.5, 'rgba(240, 200, 120, 0.03)')
  glassGrad.addColorStop(1, 'rgba(180, 140, 80, 0.08)')
  ctx.fillStyle = glassGrad
  ctx.fill()

  ctx.strokeStyle = 'rgba(200, 160, 90, 0.3)'
  ctx.lineWidth = 1.8
  ctx.stroke()

  // Caps
  const capW = BULB_RADIUS_X * 2 + 20
  ctx.fillStyle = 'rgba(140, 100, 50, 0.5)'
  ctx.beginPath()
  ctx.roundRect(CX - capW / 2, TOP - 8, capW, 8, 3)
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(CX - capW / 2, BOT, capW, 8, 3)
  ctx.fill()
}

// --- Render loop ---
let lastTime = performance.now()
let time = 0
let grainSpawnAccum = 0

function frame(now: number) {
  const elapsed = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now
  time += elapsed

  // Drain progress advances
  drainProgress = Math.min(1, drainProgress + elapsed * 0.08)
  const drainedSegs = Math.floor(drainProgress * totalSegments)
  const remainingSegs = totalSegments - drainedSegs

  // Spawn decorative falling grains near the neck
  grainSpawnAccum += elapsed
  if (grainSpawnAccum > 0.06 && drainProgress < 1 && drainProgress > 0.01) {
    grainSpawnAccum = 0
    const char = segments[Math.floor(Math.random() * segments.length)]!.trim()
    if (char.length > 0) {
      releaseGrain(char.charAt(0), CX + (Math.random() - 0.5) * NECK_RADIUS * 0.8, CY - 5)
    }
  }

  // Update falling grains
  for (let i = fallingGrains.length - 1; i >= 0; i--) {
    const g = fallingGrains[i]!
    g.vy += 300 * elapsed
    g.y += g.vy * elapsed
    g.x += g.vx * elapsed
    g.angle += g.angVel * elapsed
    g.alpha -= elapsed * 0.4
    // Confine to hourglass
    const hw = hourglassWidth(g.y)
    if (hw > 0) {
      if (g.x < CX - hw + 3) { g.x = CX - hw + 3; g.vx = Math.abs(g.vx) * 0.3 }
      if (g.x > CX + hw - 3) { g.x = CX + hw - 3; g.vx = -Math.abs(g.vx) * 0.3 }
    }
    if (g.y > BOT - 5 || g.alpha <= 0) {
      fallingGrains.splice(i, 1)
    }
  }

  // --- Render ---
  ctx.clearRect(0, 0, W, H)

  drawHourglass()

  // Neck glow
  if (drainProgress > 0.01 && drainProgress < 1) {
    const neckGlow = ctx.createRadialGradient(CX, CY, 2, CX, CY, NECK_RADIUS * 2.5)
    neckGlow.addColorStop(0, 'rgba(240, 190, 100, 0.15)')
    neckGlow.addColorStop(1, 'rgba(240, 190, 100, 0)')
    ctx.fillStyle = neckGlow
    ctx.fillRect(CX - NECK_RADIUS * 3, CY - NECK_RADIUS * 3, NECK_RADIUS * 6, NECK_RADIUS * 6)
  }

  // Layout upper bulb (text that hasn't drained yet)
  if (!flipped) {
    // Upper bulb: remaining text
    if (remainingSegs > 0) {
      const startCursor = { segmentIndex: drainedSegs, graphemeIndex: 0 }
      const { words: upperWords } = layoutInBulb(TOP + 10, CY - 10, startCursor, remainingSegs)
      ctx.font = bodyFont
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'
      for (const w of upperWords) {
        const distToNeck = Math.abs(w.y + lineHeight / 2 - CY) / BULB_HEIGHT
        const alpha = Math.max(0.4, distToNeck)
        ctx.fillStyle = `rgba(210, 180, 120, ${alpha})`
        ctx.fillText(w.text, w.x, w.y)
      }
    }

    // Lower bulb: drained text
    if (drainedSegs > 0) {
      const startCursor = { segmentIndex: 0, graphemeIndex: 0 }
      const { words: lowerWords } = layoutInBulb(CY + 10, BOT - 10, startCursor, drainedSegs)
      ctx.font = bodyFont
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'
      for (const w of lowerWords) {
        const distToNeck = Math.abs(w.y + lineHeight / 2 - CY) / BULB_HEIGHT
        const alpha = Math.max(0.5, distToNeck * 0.9)
        ctx.fillStyle = `rgba(200, 165, 100, ${alpha})`
        ctx.fillText(w.text, w.x, w.y)
      }
    }
  } else {
    // Flipped: upper gets drained text, lower gets remaining
    if (drainedSegs > 0) {
      const startCursor = { segmentIndex: 0, graphemeIndex: 0 }
      const { words: upperWords } = layoutInBulb(TOP + 10, CY - 10, startCursor, drainedSegs)
      ctx.font = bodyFont
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'
      for (const w of upperWords) {
        const distToNeck = Math.abs(w.y + lineHeight / 2 - CY) / BULB_HEIGHT
        ctx.fillStyle = `rgba(200, 165, 100, ${Math.max(0.5, distToNeck * 0.9)})`
        ctx.fillText(w.text, w.x, w.y)
      }
    }
    if (remainingSegs > 0) {
      const startCursor = { segmentIndex: drainedSegs, graphemeIndex: 0 }
      const { words: lowerWords } = layoutInBulb(CY + 10, BOT - 10, startCursor, remainingSegs)
      ctx.font = bodyFont
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'
      for (const w of lowerWords) {
        const distToNeck = Math.abs(w.y + lineHeight / 2 - CY) / BULB_HEIGHT
        ctx.fillStyle = `rgba(210, 180, 120, ${Math.max(0.4, distToNeck)})`
        ctx.fillText(w.text, w.x, w.y)
      }
    }
  }

  // Draw falling grains
  ctx.font = bodyFont
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (const g of fallingGrains) {
    ctx.save()
    ctx.translate(g.x, g.y)
    ctx.rotate(g.angle)
    ctx.fillStyle = `rgba(220, 180, 100, ${g.alpha})`
    ctx.fillText(g.char, 0, 0)
    ctx.restore()
  }

  // Caption
  ctx.font = 'italic 11px Georgia, "Times New Roman", serif'
  ctx.fillStyle = '#5a4530'
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'center'
  ctx.fillText('layoutNextLine() fills the hourglass contour — text drains through the neck over time. Click to flip.', W / 2, H - 12)

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
