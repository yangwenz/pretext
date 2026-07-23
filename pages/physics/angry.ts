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
  iterations: 6,
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

const towerChars = [
  ['P', 'H', 'Y'],
  ['S', 'I', 'C'],
  ['T', 'E', 'X'],
  ['T', '!', '!'],
]
const blockColors = ['#01a3a4', '#00cec9', '#55efc4', '#81ecec']
const blockSize = 28

function buildTower() {
  const towerX = W - 200
  const groundY = H - 20

  for (let row = 0; row < towerChars.length; row++) {
    const chars = towerChars[row]!
    const rowY = groundY - (row + 1) * (blockSize + 2)
    const rowColor = blockColors[row % blockColors.length]!

    for (let col = 0; col < chars.length; col++) {
      const char = chars[col]!
      const x = towerX + col * (blockSize + 3) - ((chars.length - 1) * (blockSize + 3)) / 2

      const body = createBody(world, char, blockFont, {
        position: { x, y: rowY },
        mass: 2,
        width: blockSize,
        height: blockSize,
        restitution: 0.2,
        friction: 0.6,
        collisionGroup: 0,
      })

      blocks.push({ body, char, color: rowColor, hp: 1 })

      // Connect adjacent blocks in same row
      if (col > 0) {
        const prevBlock = blocks[blocks.length - 2]!
        createConnection(world, {
          type: 'rigid',
          a: prevBlock.body.id,
          b: body.id,
          length: blockSize + 3,
          breakForce: 80,
        })
      }
    }

    // Connect to row below (vertical)
    if (row > 0) {
      const prevRowStart = blocks.length - chars.length - towerChars[row - 1]!.length
      const curRowStart = blocks.length - chars.length
      const prevChars = towerChars[row - 1]!
      const connectCount = Math.min(chars.length, prevChars.length)
      for (let c = 0; c < connectCount; c++) {
        createConnection(world, {
          type: 'rigid',
          a: blocks[prevRowStart + c]!.body.id,
          b: blocks[curRowStart + c]!.body.id,
          length: blockSize + 2,
          breakForce: 60,
        })
      }
    }
  }

  // Add some horizontal planks
  const plankChars = ['—', '—', '—', '—', '—']
  const plankY = groundY - towerChars.length * (blockSize + 2) - 4
  const plankStartX = towerX - (plankChars.length * 20) / 2

  for (let i = 0; i < plankChars.length; i++) {
    const body = createBody(world, '—', blockFont, {
      position: { x: plankStartX + i * 20, y: plankY },
      mass: 1,
      width: 18,
      height: 8,
      restitution: 0.1,
      friction: 0.8,
      collisionGroup: 0,
    })
    blocks.push({ body, char: '—', color: '#636e72', hp: 1 })

    if (i > 0) {
      createConnection(world, {
        type: 'rigid',
        a: blocks[blocks.length - 2]!.body.id,
        b: body.id,
        length: 20,
        breakForce: 40,
      })
    }
  }
}

function loadBird() {
  const word = birdWords[birdIdx % birdWords.length]!
  ctx.font = birdFont
  const w = ctx.measureText(word).width

  activeBird = createBody(world, word, birdFont, {
    position: { x: slingX, y: slingY },
    mass: 4,
    width: w + 8,
    height: 26,
    restitution: 0.4,
    friction: 0.3,
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
    iterations: 6,
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
  const power = 12

  activeBird.mass = 4
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

  // Ground
  ctx.fillStyle = '#2a2a35'
  ctx.fillRect(0, H - 20, W, 20)

  // Slingshot
  ctx.strokeStyle = '#8a7050'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(slingX - 12, H - 20)
  ctx.lineTo(slingX - 8, slingY + 10)
  ctx.moveTo(slingX + 12, H - 20)
  ctx.lineTo(slingX + 8, slingY + 10)
  ctx.stroke()

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
    ctx.fillStyle = block.color + '44'
    ctx.strokeStyle = block.color + '88'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(-blockSize / 2, -blockSize / 2, blockSize, blockSize, 3)
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
