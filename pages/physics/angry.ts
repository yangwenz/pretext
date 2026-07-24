import { createWorld, createBody, createConnection, step } from '../../src/physics/index.js'
import type { Body } from '../../src/physics/types.js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const dpr = window.devicePixelRatio || 1

const W = Math.min(900, window.innerWidth - 48)
const H = 500
canvas.width = W * dpr
canvas.height = H * dpr
canvas.style.width = `${W}px`
canvas.style.height = `${H}px`
ctx.scale(dpr, dpr)

const scoreEl = document.getElementById('score')!

// --- Fonts ---
const blockFont = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
const birdFont = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'

// --- World ---
let world = createWorld({
  gravity: { x: 0, y: 600 },
  bounds: { x: 0, y: 0, width: W, height: H },
  iterations: 4,
  damping: 0.997,
  sleepThresholdVel: 0.4,
  sleepDelay: 90,
})

// --- Slingshot ---
const slingX = 120
const slingY = H - 100

// --- Projectiles (birds = words) ---
const birdWords = ['POW', 'BAM', 'ZAP', 'BOOM', 'WHAM']
const birdColors = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff']
let birdIdx = 0
let activeBird: Body | null = null
let launched = false

// --- Tower blocks (letters stacked) ---
type Block = { body: Body; char: string; color: string; hp: number }
let blocks: Block[] = []
let score = 0

const blockColors = ['#01a3a4', '#00cec9', '#55efc4', '#81ecec']
const blockSize = 26

function addBlock(x: number, y: number, char: string, color: string, w = blockSize, h = blockSize) {
  const body = createBody(world, char, blockFont, {
    position: { x, y },
    mass: 1,
    width: w,
    height: h,
    restitution: 0.3,
    friction: 0.15,
    collisionGroup: 0,
    sleeping: false,
    sleepTimer: 85,
  })
  blocks.push({ body, char, color, hp: 1 })
  return body
}

function buildTower() {
  const towerX = W - 200
  const groundY = H - 20
  const pillarGap = blockSize * 2.5
  const platH = 10
  const bottom = groundY - blockSize / 2

  // --- Bottom tier: two pillars ---
  const lx = towerX - pillarGap / 2
  addBlock(lx, bottom, 'P', blockColors[0]!)
  addBlock(lx, bottom - blockSize, 'H', blockColors[0]!)
  addBlock(lx, bottom - blockSize * 2, 'Y', blockColors[0]!)

  const rx = towerX + pillarGap / 2
  addBlock(rx, bottom, 'S', blockColors[1]!)
  addBlock(rx, bottom - blockSize, 'I', blockColors[1]!)
  addBlock(rx, bottom - blockSize * 2, 'C', blockColors[1]!)

  // Platform resting on top of pillars
  const pillarTopY = bottom - blockSize * 2 - blockSize / 2
  const platY = pillarTopY - platH / 2
  addBlock(towerX - blockSize, platY, '—', '#636e72', blockSize, platH)
  addBlock(towerX, platY, '—', '#636e72', blockSize, platH)
  addBlock(towerX + blockSize, platY, '—', '#636e72', blockSize, platH)

  // --- Top tier resting on platform ---
  const topBase = platY - platH / 2 - blockSize / 2
  addBlock(towerX - blockSize * 0.6, topBase, 'T', blockColors[2]!)
  addBlock(towerX + blockSize * 0.6, topBase, 'E', blockColors[2]!)

  // Top cap
  addBlock(towerX, topBase - blockSize, 'X', blockColors[3]!)
  addBlock(towerX, topBase - blockSize * 2, 'T', blockColors[3]!)
}

function loadBird() {
  const word = birdWords[birdIdx % birdWords.length]!
  ctx.font = birdFont
  const w = ctx.measureText(word).width

  activeBird = createBody(world, word, birdFont, {
    position: { x: slingX, y: slingY },
    mass: 8,
    width: w + 8,
    height: 26,
    restitution: 0.5,
    friction: 0.15,
    collisionGroup: 0,
  })
  // Keep it static until launched
  activeBird.mass = Infinity
  launched = false
  birdIdx++
}

function reset() {
  world = createWorld({
    gravity: { x: 0, y: 600 },
    bounds: { x: 0, y: 0, width: W, height: H },
    iterations: 4,
    damping: 0.997,
    sleepThresholdVel: 0.4,
    sleepDelay: 90,
  })
  blocks = []
  score = 0
  scoreEl.textContent = 'Score: 0'
  birdIdx = 0
  buildTower()
  loadBird()
}

reset()

// --- Slingshot aiming ---
let aiming = false
let aimX = slingX
let aimY = slingY
const maxPull = 100

canvas.addEventListener('mousedown', (e) => {
  if (launched) {
    // After launch, click to load next bird
    loadBird()
    return
  }
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const dx = mx - slingX
  const dy = my - slingY
  if (dx * dx + dy * dy < 60 * 60) {
    aiming = true
    aimX = slingX
    aimY = slingY
  }
})

canvas.addEventListener('mousemove', (e) => {
  if (!aiming) return
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const dx = mx - slingX
  const dy = my - slingY
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist > maxPull) {
    aimX = slingX + (dx / dist) * maxPull
    aimY = slingY + (dy / dist) * maxPull
  } else {
    aimX = mx
    aimY = my
  }
  if (activeBird) {
    activeBird.position.x = aimX
    activeBird.position.y = aimY
  }
})

canvas.addEventListener('mouseup', () => {
  if (!aiming || !activeBird) return
  aiming = false

  // Launch: velocity is opposite of pull direction
  const dx = slingX - aimX
  const dy = slingY - aimY
  const power = 18

  activeBird.mass = 8
  activeBird.velocity.x = dx * power
  activeBird.velocity.y = dy * power
  activeBird.sleeping = false
  activeBird.sleepTimer = 0
  launched = true
})

document.getElementById('btn-reset')!.addEventListener('click', reset)

// --- Score: count blocks that fell off screen or were hit hard ---
function updateScore() {
  let newScore = 0
  for (const block of blocks) {
    if (block.body.position.y > H - 10 && block.body.position.x > W * 0.4) continue
    if (block.body.dead) { newScore += 10; continue }
    const speed = Math.sqrt(
      block.body.velocity.x * block.body.velocity.x +
      block.body.velocity.y * block.body.velocity.y
    )
    if (speed > 100) newScore += 5
    if (block.body.position.y > H + 50) {
      block.body.dead = true
      newScore += 10
    }
  }
  score = newScore
  scoreEl.textContent = `Score: ${score}`
}

// --- Render ---
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
    step(world, FIXED_DT)
    accumulator -= FIXED_DT
    steps++
  }

  updateScore()

  ctx.clearRect(0, 0, W, H)

  // Gradient ground
  const groundGrad = ctx.createLinearGradient(0, H - 20, 0, H)
  groundGrad.addColorStop(0, '#2a2a38')
  groundGrad.addColorStop(1, '#1a1a25')
  ctx.fillStyle = groundGrad
  ctx.fillRect(0, H - 20, W, 20)

  // Ground highlight line
  ctx.strokeStyle = 'rgba(108, 138, 255, 0.06)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, H - 20)
  ctx.lineTo(W, H - 20)
  ctx.stroke()

  // Slingshot with wood grain
  const woodGrad = ctx.createLinearGradient(slingX - 12, 0, slingX + 12, 0)
  woodGrad.addColorStop(0, '#6a5030')
  woodGrad.addColorStop(0.5, '#9a7050')
  woodGrad.addColorStop(1, '#6a5030')
  ctx.strokeStyle = woodGrad
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(slingX - 12, H - 20)
  ctx.lineTo(slingX - 8, slingY + 10)
  ctx.moveTo(slingX + 12, H - 20)
  ctx.lineTo(slingX + 8, slingY + 10)
  ctx.stroke()
  ctx.lineCap = 'butt'

  // Sling band
  if (aiming && activeBird) {
    ctx.strokeStyle = '#c0a070'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(slingX - 8, slingY + 10)
    ctx.lineTo(activeBird.position.x, activeBird.position.y)
    ctx.lineTo(slingX + 8, slingY + 10)
    ctx.stroke()

    // Trajectory hint
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    const dx = slingX - aimX
    const dy = slingY - aimY
    ctx.beginPath()
    ctx.moveTo(slingX, slingY)
    let tx = slingX, ty = slingY
    let tvx = dx * 12, tvy = dy * 12
    for (let i = 0; i < 20; i++) {
      tvx *= 0.98
      tvy += 600 * 0.016
      tx += tvx * 0.016
      ty += tvy * 0.016
      ctx.lineTo(tx, ty)
    }
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Tower blocks
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (const block of blocks) {
    if (block.body.dead) continue
    const b = block.body
    ctx.save()
    ctx.translate(b.position.x, b.position.y)
    ctx.rotate(b.angle)

    // Block background
    const bw = b.width
    const bh = b.height
    ctx.fillStyle = block.color + '44'
    ctx.strokeStyle = block.color + '88'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 3)
    ctx.fill()
    ctx.stroke()

    // Letter
    ctx.font = blockFont
    ctx.fillStyle = block.color
    ctx.fillText(block.char, 0, 0)
    ctx.restore()
  }

  // Active bird
  if (activeBird && !activeBird.dead) {
    const b = activeBird
    const word = b.char
    const color = birdColors[(birdIdx - 1) % birdColors.length]!

    ctx.save()
    ctx.translate(b.position.x, b.position.y)
    ctx.rotate(b.angle)

    ctx.font = birdFont
    const w = ctx.measureText(word).width + 12
    const h = 28

    ctx.shadowColor = color + '66'
    ctx.shadowBlur = 8
    ctx.fillStyle = '#1a1a22'
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(-w / 2, -h / 2, w, h, h / 2)
    ctx.fill()
    ctx.stroke()
    ctx.shadowBlur = 0

    ctx.fillStyle = color
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText(word, 0, 0)
    ctx.restore()
  }

  // Instructions
  if (!launched && !aiming) {
    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
    ctx.fillStyle = '#6a6670'
    ctx.textBaseline = 'bottom'
    ctx.textAlign = 'left'
    ctx.fillText('← Drag to aim', slingX + 30, slingY + 5)
  }
  if (launched) {
    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
    ctx.fillStyle = '#6a6670'
    ctx.textBaseline = 'bottom'
    ctx.textAlign = 'left'
    ctx.fillText('Click to load next word', 20, H - 30)
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
