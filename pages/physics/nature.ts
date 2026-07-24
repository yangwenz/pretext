import { prepareWithSegments, layoutNextLine, type LayoutCursor } from '../../src/layout.js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const dpr = window.devicePixelRatio || 1

const W = Math.min(960, window.innerWidth - 48)
const H = 720
canvas.width = W * dpr
canvas.height = H * dpr
canvas.style.width = `${W}px`
canvas.style.height = `${H}px`
ctx.scale(dpr, dpr)

const bodyFont = '15px Georgia, "Times New Roman", serif'
const lineHeight = 23
const marginX = 30
const textStartY = 20

const documentText = `The wind is not a thing you see — it is a thing you feel and a thing you read in the bending of branches. Before there were instruments, sailors read the sea surface: cat's paws on still water meant a breeze was coming, whitecaps meant trouble. Trees are the oldest anemometers. A willow shows the wind like a flag shows the nation: direction, strength, character. The leaves turn silver-side up before a storm, and the whole canopy leans as one body against the invisible river of air. Water remembers every wind that has ever touched it. Each ripple is a letter in a language older than speech. The pond does not fight the breeze; it transcribes it, faithfully, into concentric rings that spread until they reach the shore and return as echoes. Clouds are the wind made visible — water vapor gathered and sculpted by currents we cannot see from the ground. They drift with a patience that mocks our hurry. A cumulus cloud weighs as much as eighty elephants, yet it floats because the rising air beneath it is warmer than the air around it. The atmosphere is an ocean we have forgotten we swim in. Every breath you take is wind on a personal scale — the same physics, the same fluid dynamics, scaled to the volume of your lungs. The tree breathes too, exchanging oxygen for carbon dioxide through ten thousand stomata, each one a tiny mouth open to the sky. In the forest, the wind speaks differently than over open water. It whispers through pine needles, roars through oak crowns, hisses through bamboo. Each species has its own acoustic signature, its own song in the wind. Listen long enough and you can identify a tree by sound alone. The Japanese have a word for this: komorebi — the scattered light that filters through leaves when the wind moves them. It is not just light; it is light made alive by motion.`

const prepared = prepareWithSegments(documentText, bodyFont)
const internalWidths: number[] = (prepared as any).widths
const segments: string[] = prepared.segments

// --- Wind ---
let windStrength = 0.5
let windTarget = 0.5
let gustTimer = 0

// --- Clouds ---
type Cloud = {
  x: number; y: number
  width: number; height: number
  speed: number
  puffs: { ox: number; oy: number; r: number }[]
}
const clouds: Cloud[] = []

function makeCloud(x: number, y: number, size: number): Cloud {
  const puffs: Cloud['puffs'] = []
  const count = 4 + Math.floor(Math.random() * 4)
  for (let i = 0; i < count; i++) {
    puffs.push({
      ox: (Math.random() - 0.5) * size * 0.8,
      oy: (Math.random() - 0.5) * size * 0.3,
      r: size * 0.25 + Math.random() * size * 0.25,
    })
  }
  return {
    x, y,
    width: size * 1.2,
    height: size * 0.5,
    speed: 10 + Math.random() * 20,
    puffs,
  }
}

clouds.push(makeCloud(W * 0.2, 50, 80))
clouds.push(makeCloud(W * 0.55, 30, 100))
clouds.push(makeCloud(W * 0.8, 65, 70))
clouds.push(makeCloud(W * 0.1, 90, 55))
clouds.push(makeCloud(W * 0.7, 100, 60))

// --- Tree ---
const TREE_X = W * 0.72
const TREE_GROUND_Y = H * 0.75
const TRUNK_HEIGHT = 180

type Branch = {
  x: number; y: number
  length: number; baseAngle: number; angle: number
  depth: number
  children: Branch[]
}

function buildTree(x: number, y: number, length: number, angle: number, depth: number): Branch {
  const branch: Branch = { x, y, length, baseAngle: angle, angle, depth, children: [] }
  if (depth < 5) {
    const count = depth < 2 ? 3 : 2
    for (let i = 0; i < count; i++) {
      const spread = 0.5 + Math.random() * 0.4
      const childAngle = angle + (i - (count - 1) / 2) * spread
      const childLen = length * (0.6 + Math.random() * 0.15)
      const endX = x + Math.cos(childAngle) * length
      const endY = y + Math.sin(childAngle) * length
      branch.children.push(buildTree(endX, endY, childLen, childAngle, depth + 1))
    }
  }
  return branch
}

const tree = buildTree(TREE_X, TREE_GROUND_Y, 60, -Math.PI / 2, 0)

// --- Leaves (particles attached to branch tips) ---
type Leaf = {
  x: number; y: number
  homeX: number; homeY: number
  vx: number; vy: number
  angle: number; rotSpeed: number
  size: number; color: string
  detached: boolean
  life: number
}
const leaves: Leaf[] = []
const leafColors = ['#2e8b57', '#3cb371', '#228b22', '#6b8e23', '#556b2f', '#8fbc8f', '#90ee90']

function collectBranchTips(branch: Branch, tips: { x: number; y: number }[]) {
  if (branch.children.length === 0) {
    const endX = branch.x + Math.cos(branch.angle) * branch.length
    const endY = branch.y + Math.sin(branch.angle) * branch.length
    tips.push({ x: endX, y: endY })
  }
  for (const child of branch.children) collectBranchTips(child, tips)
}

const tips: { x: number; y: number }[] = []
collectBranchTips(tree, tips)

for (let i = 0; i < 120; i++) {
  const tip = tips[Math.floor(Math.random() * tips.length)]!
  const ox = (Math.random() - 0.5) * 30
  const oy = (Math.random() - 0.5) * 30
  leaves.push({
    x: tip.x + ox, y: tip.y + oy,
    homeX: tip.x + ox, homeY: tip.y + oy,
    vx: 0, vy: 0,
    angle: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 3,
    size: 3 + Math.random() * 4,
    color: leafColors[Math.floor(Math.random() * leafColors.length)]!,
    detached: false,
    life: 0,
  })
}

// --- Water / Pond ---
const POND_Y = H * 0.82
const WAVE_POINTS = 60
const waterSurface: number[] = new Array(WAVE_POINTS).fill(0)
const waterVelocity: number[] = new Array(WAVE_POINTS).fill(0)

// --- Ripples ---
type Ripple = { x: number; y: number; radius: number; maxRadius: number; life: number }
const ripples: Ripple[] = []

// --- Click to gust ---
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  windTarget = 1.5 + Math.random() * 0.5
  gustTimer = 1.5

  // Splash if clicked on water
  if (my > POND_Y - 20) {
    const idx = Math.floor((mx / W) * WAVE_POINTS)
    if (idx >= 0 && idx < WAVE_POINTS) {
      waterVelocity[idx] = -80 - Math.random() * 40
    }
    ripples.push({ x: mx, y: POND_Y + 5, radius: 0, maxRadius: 40 + Math.random() * 30, life: 0 })
  }

  // Detach some leaves
  for (const leaf of leaves) {
    if (!leaf.detached && Math.random() < 0.15) {
      leaf.detached = true
      leaf.vx = windStrength * 80 + Math.random() * 30
      leaf.vy = -20 - Math.random() * 40
    }
  }
})

// --- Text layout around obstacles ---
type PositionedWord = { text: string; x: number; y: number; width: number }

// Compute actual tree bounding box from branch tips
let treeBBoxTop = TREE_GROUND_Y
let treeBBoxLeft = TREE_X
let treeBBoxRight = TREE_X
function computeTreeBBox(branch: Branch) {
  const endX = branch.x + Math.cos(branch.angle) * branch.length
  const endY = branch.y + Math.sin(branch.angle) * branch.length
  if (endY < treeBBoxTop) treeBBoxTop = endY
  if (endX < treeBBoxLeft) treeBBoxLeft = endX
  if (endX > treeBBoxRight) treeBBoxRight = endX
  for (const child of branch.children) computeTreeBBox(child)
}
computeTreeBBox(tree)
treeBBoxTop -= 20
treeBBoxLeft -= 15
treeBBoxRight += 15

function getTreeBounds(lineY: number): { left: number; right: number } | null {
  const bandMid = lineY + lineHeight / 2
  if (bandMid < treeBBoxTop || bandMid > TREE_GROUND_Y) return null
  // Trunk zone (narrow)
  const trunkTop = TREE_GROUND_Y - 60
  if (bandMid > trunkTop) {
    return { left: TREE_X - 12, right: TREE_X + 12 }
  }
  // Canopy zone (elliptical, based on actual branch extents)
  const canopyCenterY = (treeBBoxTop + trunkTop) / 2
  const canopyHalfH = (trunkTop - treeBBoxTop) / 2
  const dy = bandMid - canopyCenterY
  const t = dy / canopyHalfH
  if (Math.abs(t) < 1) {
    const canopyHalfW = (treeBBoxRight - treeBBoxLeft) / 2
    const halfWidth = canopyHalfW * Math.sqrt(1 - t * t)
    const cx = (treeBBoxLeft + treeBBoxRight) / 2
    return { left: cx - halfWidth, right: cx + halfWidth }
  }
  return null
}

function layoutText(): PositionedWord[] {
  const words: PositionedWord[] = []
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let lineTop = textStartY
  const regionLeft = marginX
  const regionRight = W - marginX

  while (lineTop + lineHeight < POND_Y - 5) {
    const blocked: { left: number; right: number }[] = []

    // Clouds
    for (const c of clouds) {
      const cTop = c.y - c.height / 2
      const cBot = c.y + c.height / 2
      if (cBot > lineTop && cTop < lineTop + lineHeight) {
        blocked.push({ left: c.x - c.width / 2 - 8, right: c.x + c.width / 2 + 8 })
      }
    }

    // Tree
    const treeBound = getTreeBounds(lineTop)
    if (treeBound) {
      blocked.push({ left: treeBound.left - 8, right: treeBound.right + 8 })
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

// --- Animation ---
let lastTime = performance.now()
let time = 0

function frame(now: number) {
  const elapsed = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now
  time += elapsed

  // --- Wind dynamics ---
  gustTimer -= elapsed
  if (gustTimer <= 0) {
    windTarget = 0.3 + Math.random() * 0.5
  }
  windStrength += (windTarget - windStrength) * elapsed * 2

  // --- Update clouds ---
  for (const c of clouds) {
    c.x += c.speed * windStrength * elapsed
    if (c.x - c.width / 2 > W + 50) {
      c.x = -c.width / 2 - 30
      c.y = 30 + Math.random() * 80
    }
  }

  // --- Update tree (wind bends branches) ---
  function windBranch(branch: Branch, _parentAngle: number) {
    const windBend = windStrength * 0.04 * (branch.depth + 1)
    const sway = Math.sin(time * 1.5 + branch.x * 0.01 + branch.depth) * 0.03 * (branch.depth + 1)
    branch.angle = branch.baseAngle + windBend + sway
    const endX = branch.x + Math.cos(branch.angle) * branch.length
    const endY = branch.y + Math.sin(branch.angle) * branch.length
    for (const child of branch.children) {
      child.x = endX
      child.y = endY
      windBranch(child, branch.angle)
    }
  }
  windBranch(tree, -Math.PI / 2)

  // --- Update leaves ---
  for (const leaf of leaves) {
    if (leaf.detached) {
      leaf.vx += windStrength * 60 * elapsed
      leaf.vy += 50 * elapsed // gravity
      leaf.vx *= 0.99
      leaf.vy *= 0.99
      leaf.x += leaf.vx * elapsed
      leaf.y += leaf.vy * elapsed
      leaf.angle += leaf.rotSpeed * elapsed
      leaf.life += elapsed

      // Reset if off-screen or in water
      if (leaf.x > W + 20 || leaf.y > POND_Y) {
        leaf.detached = false
        const tip = tips[Math.floor(Math.random() * tips.length)]!
        leaf.homeX = tip.x + (Math.random() - 0.5) * 30
        leaf.homeY = tip.y + (Math.random() - 0.5) * 30
        leaf.x = leaf.homeX
        leaf.y = leaf.homeY
        leaf.vx = 0
        leaf.vy = 0
        leaf.life = 0
      }
    } else {
      // Sway with wind on the tree
      const sway = windStrength * 4 * Math.sin(time * 2 + leaf.homeX * 0.05)
      leaf.x = leaf.homeX + sway
      leaf.y = leaf.homeY + Math.sin(time * 1.8 + leaf.homeY * 0.03) * 1.5
      leaf.angle += windStrength * 0.5 * elapsed
    }
  }

  // --- Water surface simulation ---
  for (let i = 0; i < WAVE_POINTS; i++) {
    waterVelocity[i] = waterVelocity[i]! + -waterSurface[i]! * 0.03
    waterVelocity[i] = waterVelocity[i]! * 0.98
  }
  for (let i = 1; i < WAVE_POINTS - 1; i++) {
    waterVelocity[i] = waterVelocity[i]! + (waterSurface[i - 1]! - waterSurface[i]!) * 0.15
    waterVelocity[i] = waterVelocity[i]! + (waterSurface[i + 1]! - waterSurface[i]!) * 0.15
  }
  for (let i = 0; i < WAVE_POINTS; i++) {
    waterSurface[i] = waterSurface[i]! + waterVelocity[i]! * elapsed * 60
  }
  // Wind generates small waves
  const windWaveIdx = Math.floor(Math.random() * WAVE_POINTS)
  waterVelocity[windWaveIdx] = waterVelocity[windWaveIdx]! + (Math.random() - 0.5) * windStrength * 8

  // --- Update ripples ---
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i]!
    r.radius += 40 * elapsed
    r.life += elapsed
    if (r.radius > r.maxRadius) ripples.splice(i, 1)
  }

  // =================== RENDER ===================
  ctx.clearRect(0, 0, W, H)

  // --- Sky gradient ---
  const skyGrad = ctx.createLinearGradient(0, 0, 0, POND_Y)
  skyGrad.addColorStop(0, '#0a1628')
  skyGrad.addColorStop(0.4, '#122240')
  skyGrad.addColorStop(0.7, '#1a3355')
  skyGrad.addColorStop(1, '#1e3a5a')
  ctx.fillStyle = skyGrad
  ctx.fillRect(0, 0, W, POND_Y)

  // --- Stars (subtle) ---
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
  for (let i = 0; i < 30; i++) {
    const sx = (i * 137.5 + 50) % W
    const sy = (i * 73.7 + 20) % (POND_Y * 0.4)
    const twinkle = Math.sin(time * 2 + i * 1.3) * 0.5 + 0.5
    ctx.globalAlpha = twinkle * 0.4
    ctx.beginPath()
    ctx.arc(sx, sy, 0.8, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // --- Draw clouds ---
  for (const c of clouds) {
    ctx.save()
    for (const puff of c.puffs) {
      const px = c.x + puff.ox
      const py = c.y + puff.oy
      const grad = ctx.createRadialGradient(px, py, puff.r * 0.2, px, py, puff.r)
      grad.addColorStop(0, 'rgba(200, 215, 235, 0.25)')
      grad.addColorStop(0.6, 'rgba(150, 175, 210, 0.12)')
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(px, py, puff.r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // --- Draw tree ---
  function drawBranch(branch: Branch) {
    const endX = branch.x + Math.cos(branch.angle) * branch.length
    const endY = branch.y + Math.sin(branch.angle) * branch.length
    const thickness = Math.max(1, 8 - branch.depth * 1.5)
    ctx.strokeStyle = branch.depth < 2 ? '#3d2b1f' : '#5a4030'
    ctx.lineWidth = thickness
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(branch.x, branch.y)
    ctx.lineTo(endX, endY)
    ctx.stroke()
    for (const child of branch.children) drawBranch(child)
  }
  drawBranch(tree)

  // --- Draw leaves ---
  for (const leaf of leaves) {
    ctx.save()
    ctx.translate(leaf.x, leaf.y)
    ctx.rotate(leaf.angle)
    ctx.fillStyle = leaf.color
    if (leaf.detached) {
      ctx.globalAlpha = Math.max(0, 1 - leaf.life * 0.5)
    } else {
      ctx.globalAlpha = 0.85
    }
    ctx.beginPath()
    ctx.ellipse(0, 0, leaf.size, leaf.size * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // --- Draw wind streaks ---
  ctx.save()
  ctx.globalAlpha = windStrength * 0.2
  ctx.strokeStyle = 'rgba(200, 220, 255, 0.4)'
  ctx.lineWidth = 0.5
  for (let i = 0; i < 12; i++) {
    const wy = 60 + i * 45 + Math.sin(time + i) * 20
    const wx = ((time * 80 * windStrength + i * 97) % (W + 100)) - 50
    const wLen = 30 + windStrength * 40
    ctx.beginPath()
    ctx.moveTo(wx, wy)
    ctx.lineTo(wx + wLen, wy + Math.sin(time * 2 + i) * 3)
    ctx.stroke()
  }
  ctx.restore()

  // --- Reflow and draw text ---
  const words = layoutText()

  ctx.font = bodyFont
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  for (const w of words) {
    // Wind sway on text
    const sway = windStrength * 2 * Math.sin(time * 1.2 + w.y * 0.02 + w.x * 0.005)
    const wy = w.y

    // Color based on height: lighter at top (sky), greener near tree
    const distToTree = Math.sqrt((w.x + w.width / 2 - TREE_X) ** 2 + (wy + lineHeight / 2 - (TREE_GROUND_Y - TRUNK_HEIGHT / 2)) ** 2)
    const treeInfluence = Math.max(0, 1 - distToTree / 200)

    const r = Math.round(130 + treeInfluence * -30)
    const g = Math.round(140 + treeInfluence * 40)
    const b = Math.round(155 + treeInfluence * -40)
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
    ctx.globalAlpha = 0.8
    ctx.fillText(w.text, w.x + sway, wy)
  }
  ctx.globalAlpha = 1

  // --- Draw water ---
  // Water body
  const waterGrad = ctx.createLinearGradient(0, POND_Y, 0, H)
  waterGrad.addColorStop(0, 'rgba(20, 60, 100, 0.9)')
  waterGrad.addColorStop(0.3, 'rgba(15, 45, 80, 0.95)')
  waterGrad.addColorStop(1, 'rgba(8, 25, 50, 1)')
  ctx.fillStyle = waterGrad
  ctx.beginPath()
  ctx.moveTo(0, POND_Y)
  for (let i = 0; i < WAVE_POINTS; i++) {
    const x = (i / (WAVE_POINTS - 1)) * W
    const y = POND_Y + waterSurface[i]!
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.lineTo(W, H)
  ctx.lineTo(0, H)
  ctx.closePath()
  ctx.fill()

  // Surface highlight
  ctx.strokeStyle = 'rgba(100, 180, 255, 0.3)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let i = 0; i < WAVE_POINTS; i++) {
    const x = (i / (WAVE_POINTS - 1)) * W
    const y = POND_Y + waterSurface[i]!
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()

  // Ripples
  for (const r of ripples) {
    const alpha = Math.max(0, 1 - r.radius / r.maxRadius)
    ctx.strokeStyle = `rgba(150, 200, 255, ${alpha * 0.5})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(r.x, r.y, r.radius, r.radius * 0.3, 0, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Reflection of tree (subtle)
  ctx.save()
  ctx.globalAlpha = 0.12
  ctx.translate(0, POND_Y * 2)
  ctx.scale(1, -1)
  drawBranch(tree)
  ctx.restore()

  // --- Water caustics (light patterns) ---
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.globalAlpha = 0.04
  for (let i = 0; i < 8; i++) {
    const cx = W * 0.2 + i * W * 0.08 + Math.sin(time * 0.7 + i) * 20
    const cy = POND_Y + 20 + Math.sin(time * 0.5 + i * 2) * 10
    const cr = 15 + Math.sin(time + i * 3) * 5
    ctx.fillStyle = 'rgba(100, 200, 255, 1)'
    ctx.beginPath()
    ctx.ellipse(cx, cy, cr, cr * 0.6, time * 0.3 + i, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // --- Ground line ---
  ctx.strokeStyle = 'rgba(60, 80, 40, 0.4)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, TREE_GROUND_Y)
  ctx.lineTo(W, TREE_GROUND_Y)
  ctx.stroke()

  // Grass tufts at ground
  ctx.save()
  ctx.strokeStyle = 'rgba(50, 100, 40, 0.5)'
  ctx.lineWidth = 1
  for (let i = 0; i < 40; i++) {
    const gx = i * (W / 40) + 10
    const gy = TREE_GROUND_Y
    const lean = windStrength * 4 + Math.sin(time * 2 + i * 0.5) * 2
    ctx.beginPath()
    ctx.moveTo(gx, gy)
    ctx.lineTo(gx + lean, gy - 8 - Math.random() * 4)
    ctx.stroke()
  }
  ctx.restore()

  // --- Caption ---
  ctx.font = 'italic 11px Georgia, "Times New Roman", serif'
  ctx.fillStyle = '#4a6a7a'
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'center'
  ctx.fillText('layoutNextLine() reflows text around clouds and tree — click to gust the wind', W / 2, H - 8)

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
