import { createWorld, createBody, createConnection, step, applyInteraction } from '../../src/physics/index.js'
import type { Body } from '../../src/physics/types.js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const dpr = window.devicePixelRatio || 1

const W = Math.min(900, window.innerWidth - 48)
const H = 600
canvas.width = W * dpr
canvas.height = H * dpr
canvas.style.width = `${W}px`
canvas.style.height = `${H}px`
ctx.scale(dpr, dpr)

const world = createWorld({
  gravity: { x: 0, y: 400 },
  bounds: { x: 0, y: 0, width: W, height: H },
  iterations: 6,
  damping: 0.995,
})

const font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
ctx.font = font

type WordObject = {
  bodies: Body[]
  color: string
  groupId: number
}

const words = ['HELLO', 'WORLD', 'PHYSICS', 'ENGINE', 'DEMO', 'BOUNCE', 'CRASH', 'TEXT']
const colors = ['#ff6b6b', '#48dbfb', '#feca57', '#ff9ff3', '#54a0ff', '#01a3a4', '#f368e0', '#5f27cd']

const wordObjects: WordObject[] = []
let groupCounter = 1

function createWordObject(word: string, x: number, y: number, color: string, vx: number, vy: number): WordObject {
  const groupId = groupCounter++
  const graphemes = [...word]
  const bodies: Body[] = []
  const spacing = 2

  let totalWidth = 0
  const charWidths: number[] = []
  for (const char of graphemes) {
    const w = ctx.measureText(char).width
    charWidths.push(w)
    totalWidth += w + (charWidths.length > 1 ? spacing : 0)
  }

  let cx = x - totalWidth / 2
  for (let i = 0; i < graphemes.length; i++) {
    const char = graphemes[i]!
    const charWidth = charWidths[i]!
    const body = createBody(world, char, font, {
      position: { x: cx + charWidth / 2, y },
      velocity: { x: vx + (Math.random() - 0.5) * 20, y: vy },
      mass: 2,
      width: charWidth,
      height: 26,
      restitution: 0.5,
      friction: 0.3,
      collisionGroup: groupId,
    })
    bodies.push(body)

    if (i > 0) {
      const prevWidth = charWidths[i - 1]!
      createConnection(world, {
        type: 'rigid',
        a: bodies[i - 1]!.id,
        b: body.id,
        length: (prevWidth + charWidth) / 2 + spacing,
      })
    }

    cx += charWidth + spacing
  }

  return { bodies, color, groupId }
}

// Spawn initial words at various positions with random velocities
function spawnInitialWords() {
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!
    const color = colors[i % colors.length]!
    const x = 100 + Math.random() * (W - 200)
    const y = 50 + Math.random() * (H * 0.4)
    const vx = (Math.random() - 0.5) * 200
    const vy = (Math.random() - 0.5) * 100
    wordObjects.push(createWordObject(word, x, y, color, vx, vy))
  }
}

spawnInitialWords()

// Click to create impulse
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect()
  const clickX = e.clientX - rect.left
  const clickY = e.clientY - rect.top
  applyInteraction(world, {
    type: 'impulse',
    position: { x: clickX, y: clickY },
    radius: 200,
    strength: 600,
  })
  // Wake all bodies
  for (const body of world.bodies) {
    body.sleeping = false
    body.sleepTimer = 0
  }
})

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

  ctx.clearRect(0, 0, W, H)

  // Draw connections as subtle lines
  ctx.lineWidth = 1
  for (const obj of wordObjects) {
    ctx.strokeStyle = obj.color + '33'
    for (let i = 1; i < obj.bodies.length; i++) {
      const a = obj.bodies[i - 1]!
      const b = obj.bodies[i]!
      ctx.beginPath()
      ctx.moveTo(a.position.x, a.position.y)
      ctx.lineTo(b.position.x, b.position.y)
      ctx.stroke()
    }
  }

  // Draw letters
  ctx.font = font
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (const obj of wordObjects) {
    ctx.fillStyle = obj.color
    for (const body of obj.bodies) {
      if (body.dead) continue
      ctx.save()
      ctx.translate(body.position.x, body.position.y)
      ctx.rotate(body.angle)
      ctx.fillText(body.char, 0, 0)
      ctx.restore()
    }
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
