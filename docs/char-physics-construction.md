# Character-Based Physics Construction Engine

## The idea

Characters are atoms. You stack them, connect them, give them mass, and let physics run. The engine's job is:

1. Define a body from a character (glyph bounding box = collision shape)
2. Position bodies in arbitrary formations
3. Define connections between bodies (rigid, spring, rope, hinge, weld)
4. Simulate forces + constraints
5. Render each body as its character at the simulated position/rotation

## Data model

```ts
type Vec2 = { x: number; y: number }

type CharBody = {
  id: number
  char: string
  font: string
  mass: number          // user-defined, or derived from char area (Infinity = static/immovable)
  restitution: number   // bounciness [0, 1]
  friction: number      // surface friction [0, 1]

  // derived once from canvas.measureText + font metrics
  width: number
  height: number

  // physics state (updated per frame)
  position: Vec2
  velocity: Vec2
  angle: number
  angularVelocity: number
  force: Vec2           // accumulated per-frame, reset after integrate
  torque: number        // accumulated per-frame, reset after integrate

  // collision
  collisionGroup: number   // bodies in the same group skip collision with each other
  collisionMask: number    // bitmask of groups this body collides with

  // sleeping
  sleeping: boolean
  sleepTimer: number       // frames below velocity threshold

  // rendering + lifecycle
  z: number             // draw order; higher = on top
  dead: boolean         // marked for removal
}

type ConnectionBase = {
  a: number              // body id (index into bodies array)
  b: number              // body id (index into bodies array)
  breakForce?: number    // max force before the connection snaps (undefined = unbreakable)
  broken: boolean        // set to true when snapped; solver skips broken connections
  onBreak?: () => void   // callback when the connection breaks
}

type Connection = ConnectionBase & (
  | { type: 'rigid'; length: number }
  | { type: 'spring'; stiffness: number; damping: number; restLength: number }
  | { type: 'rope'; maxLength: number }
  | { type: 'hinge'; anchor: Vec2; motorSpeed?: number }
  | { type: 'weld'; referenceAngle: number }
  | { type: 'slider'; axis: Vec2; limits?: [number, number] }
)

type PhysicsWorld = {
  bodies: CharBody[]
  connections: Connection[]
  gravity: Vec2
  bounds?: Rect
}

type Rect = { x: number; y: number; width: number; height: number }
```

## Construction patterns

### A word as a rope bridge

```ts
const word = "BRIDGE"
const chars = splitGraphemes(word)
const bodies = chars.map((char, i) => createBody(char, {
  position: { x: 100 + i * 20, y: 100 },
  mass: 1
}))

// spring chain between consecutive chars
for (let i = 0; i < bodies.length - 1; i++) {
  connect(bodies[i], bodies[i + 1], { type: 'spring', stiffness: 200, damping: 5, restLength: 20 })
}

// pin first and last
pin(bodies[0], { x: 100, y: 100 })
pin(bodies[bodies.length - 1], { x: 220, y: 100 })
```

### A tower of stacked chars

```ts
const chars = splitGraphemes("TOWER").reverse()
const bodies: CharBody[] = []
for (const [i, char] of chars.entries()) {
  const body = createBody(char, {
    position: { x: 200, y: 400 - i * 24 },
    mass: char === 'T' ? 3 : 1  // heavier top
  })
  if (i > 0) connect(body, bodies[i - 1], { type: 'rigid', length: 24 })
  bodies.push(body)
}
```

### Cloth/grid

```ts
const grid = [
  "HELLO",
  "WORLD",
  "CHARS",
]
// create bodies in a grid, spring-connect horizontally and vertically
// pin the top row → cloth that drapes under gravity
```

### A sentence that shatters

```ts
// Use pretext to get correct rest positions for a paragraph
const prepared = prepareWithSegments(text, font)
const lines = layoutWithLines(prepared, maxWidth, lineHeight)
// Extract per-char bodies from the layout (accumulate segment widths)
const bodies = extractCharBodies(prepared, lines)
// Initially all welded (rigid formation)
// On event: remove all welds, apply radial impulse → shatter
```

### Pendulum clock from characters

```ts
const pivot = createBody('●', { position: { x: 200, y: 50 }, mass: Infinity }) // static
const arm = splitGraphemes("||||").map((c, i) => createBody(c, {
  position: { x: 200, y: 70 + i * 15 }, mass: 0.5
}))
const bob = createBody('◉', { position: { x: 200, y: 130 }, mass: 5 })

// hinge at top, rigid chain down to bob
connect(pivot, arm[0], { type: 'hinge', anchor: pivot.position })
chainRigid(arm, 15)  // length = spacing between arm segments
connect(arm[arm.length - 1], bob, { type: 'rigid', length: 15 })
```

### Breakable structures

Connections can have an optional `breakForce` threshold. When the constraint force exceeds it, the connection snaps permanently.

```ts
// A word held together by breakable welds — pull hard enough and letters rip off
const word = "FRAGILE"
const bodies = splitGraphemes(word).map((c, i) => createBody(c, {
  position: { x: 100 + i * 18, y: 200 },
  mass: 1
}))
for (let i = 0; i < bodies.length - 1; i++) {
  connect(bodies[i], bodies[i + 1], {
    type: 'rigid',
    length: 18,       // matches initial spacing
    breakForce: 500,  // snaps under heavy stress
    onBreak() { spawnParticles(midpoint(bodies[i], bodies[i + 1])) }
  })
}
// Drag one end → the word tears at the weakest point (or at the char farthest from the drag)
```

```ts
// Variable strength — word breaks at spaces first (weaker bonds)
function textToBreakableChain(text: string, font: string) {
  const chars = splitGraphemes(text)
  const bodies = chars.map((c, i) => createBody(c, { position: { x: i * 16, y: 0 }, mass: 1 }))
  for (let i = 0; i < bodies.length - 1; i++) {
    const isWordBoundary = chars[i] === ' ' || chars[i + 1] === ' '
    connect(bodies[i], bodies[i + 1], {
      type: 'spring',
      stiffness: 400,
      damping: 10,
      restLength: 16,
      breakForce: isWordBoundary ? 200 : 800  // spaces break first
    })
  }
  return bodies
}
// Result: "HELLO WORLD" tears into "HELLO" and "WORLD" before individual chars separate
```

```ts
// Ice/glass shatter — rigid grid that fractures under impact
const block = gridLayout("SHATTER!", { cols: 4, font: '20px mono' })
connectGrid(block, {
  type: 'rigid',
  length: 20,  // derived from grid cell size
  breakForce: 300,
  onBreak() { /* crack sound, spawn debris particles */ }
})
// Drop a heavy body on it → cracks propagate from impact point
```

**Solver integration:**

The break check measures stress differently per constraint type:

```ts
function solveConstraints(world: PhysicsWorld) {
  for (const conn of world.connections) {
    if (conn.broken) continue

    // Measure stress before applying the constraint
    if (conn.breakForce !== undefined) {
      const stress = measureStress(conn, world.bodies)
      if (stress > conn.breakForce) {
        conn.broken = true
        conn.onBreak?.()
        continue
      }
    }

    applyConstraint(conn, world.bodies)
  }
}

function measureStress(conn: Connection, bodies: CharBody[]): number {
  const a = bodies[conn.a], b = bodies[conn.b]
  const dx = b.position.x - a.position.x
  const dy = b.position.y - a.position.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  switch (conn.type) {
    case 'rigid': return Math.abs(dist - conn.length) // positional error as proxy for stress
    case 'spring': return conn.stiffness * Math.abs(dist - conn.restLength) // Hooke's law
    case 'rope': return dist > conn.maxLength ? dist - conn.maxLength : 0
    case 'weld': return Math.abs(dist) + Math.abs((b.angle - a.angle) - conn.referenceAngle)
    default: return 0
  }
}
```

Note: for rigid constraints, "stress" is the positional error (how far apart the bodies have drifted). This means `breakForce` for rigid connections is really a distance threshold — you may want to normalize by `dt²` or just tune the threshold empirically.

A useful pattern: after breaking, optionally convert the connection to a weaker type instead of fully removing it. E.g., a rigid breaks into a spring (stretchy before full separation), or a weld breaks into a hinge (can rotate but stays attached).

## Where pretext fits in this model

Pretext is **not** the physics engine. It serves two specific roles:

### Role 1: Glyph measurement

Every `CharBody` needs a width and height. Pretext's measurement cache is the fastest way to get accurate glyph widths:

```ts
function measureChar(char: string, font: string): { width: number; height: number } {
  // Pretext internally uses canvas.measureText with caching,
  // plus emoji correction for macOS Chrome/Firefox.
  // You'd either:
  // a) Use pretext's getCorrectedSegmentWidth (internal, but the logic is there)
  // b) Just call canvas.measureText yourself (simpler for single chars)
  const ctx = getCanvas2DContext()
  ctx.font = font
  const metrics = ctx.measureText(char)
  return {
    width: metrics.width,
    height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
  }
}
```

Honestly, for single-char measurement, direct `canvas.measureText()` is fine. Pretext's value is in the *segment-level* caching and i18n segmentation — which matters more for Role 2.

### Role 2: Generating "text-shaped" initial formations

When you want a physics object that *starts* as readable text (a paragraph, a word) and then does physics things (shatter, drape, wave), pretext gives you the correct starting geometry:

```ts
function textToBodyFormation(text: string, font: string, maxWidth: number, lineHeight: number): CharBody[] {
  const prepared = prepareWithSegments(text, font)
  const result = layoutWithLines(prepared, maxWidth, lineHeight)
  const bodies: CharBody[] = []

  let y = 0
  for (const line of result.lines) {
    let x = 0
    for (const grapheme of iterateGraphemes(line.text)) {
      const width = measureChar(grapheme, font).width
      bodies.push(createBody(grapheme, { position: { x, y }, mass: 1 }))
      x += width
    }
    y += lineHeight
  }
  return bodies
}
```

Without pretext, this "text → positioned chars" step would have wrong line breaks for CJK, Arabic, Thai, emoji, etc.

### Role 3: Live "rest position" updates on resize

If the physics object should *re-form* into readable text after being disturbed (like a magnet pulling scattered chars back into a paragraph), pretext recomputes the target positions on resize:

```ts
function onResize(newWidth: number) {
  const result = layoutWithLines(prepared, newWidth, lineHeight)
  // Update each body's rest/target position
  updateRestPositions(bodies, result)
  // Physics springs pull bodies toward new rest positions
}
```

## What you'd build (not pretext's job)

### The physics core

A position-based dynamics (PBD) or impulse-based solver. For character objects:

**Semi-implicit Euler** (simple, good enough for most scenes):
```ts
function integrate(body: CharBody, dt: number) {
  if (body.mass === Infinity) return // static
  const ax = body.force.x / body.mass
  const ay = body.force.y / body.mass + gravity.y
  // update velocity first (semi-implicit: uses new velocity for position)
  body.velocity.x = (body.velocity.x + ax * dt) * damping
  body.velocity.y = (body.velocity.y + ay * dt) * damping
  // moment of inertia for a rectangle: I = mass * (w² + h²) / 12
  const inertia = body.mass * (body.width * body.width + body.height * body.height) / 12
  body.angularVelocity = (body.angularVelocity + body.torque / inertia * dt) * damping
  // then update position with new velocity
  body.position.x += body.velocity.x * dt
  body.position.y += body.velocity.y * dt
  body.angle += body.angularVelocity * dt
  body.force = { x: 0, y: 0 }
  body.torque = 0
}
```

**Constraint solver** (iterative):
```ts
function solveSpring(c: Connection & { type: 'spring' }, bodies: CharBody[]) {
  const a = bodies[c.a], b = bodies[c.b]
  const dx = b.position.x - a.position.x
  const dy = b.position.y - a.position.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < 0.001) return // avoid division by zero
  const nx = dx / dist, ny = dy / dist
  // spring force (Hooke's law)
  const displacement = dist - c.restLength
  const springForce = c.stiffness * displacement
  // damping force (relative velocity along the spring axis)
  const dvx = b.velocity.x - a.velocity.x
  const dvy = b.velocity.y - a.velocity.y
  const relVelAlongAxis = dvx * nx + dvy * ny
  const dampingForce = c.damping * relVelAlongAxis
  const totalForce = springForce + dampingForce
  // Newton's third law: equal and opposite force on both bodies
  // (mass only matters in integrate() when converting force → acceleration)
  a.force.x += nx * totalForce
  a.force.y += ny * totalForce
  b.force.x -= nx * totalForce
  b.force.y -= ny * totalForce
}

function solveRigid(c: Connection & { type: 'rigid' }, bodies: CharBody[]) {
  // positional correction to maintain fixed distance
  const a = bodies[c.a], b = bodies[c.b]
  const dx = b.position.x - a.position.x
  const dy = b.position.y - a.position.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < 0.001) return
  const invMassA = a.mass === Infinity ? 0 : 1 / a.mass
  const invMassB = b.mass === Infinity ? 0 : 1 / b.mass
  const invMassSum = invMassA + invMassB
  if (invMassSum === 0) return
  const error = dist - c.length
  const correction = error / dist
  const corrA = correction * (invMassA / invMassSum)
  const corrB = correction * (invMassB / invMassSum)
  a.position.x += dx * corrA
  a.position.y += dy * corrA
  b.position.x -= dx * corrB
  b.position.y -= dy * corrB
}
```

**Collision detection** (AABB broadphase + OBB or circle narrowphase):
- Each char body has a rotated rectangle collider (width x height from measurement)
- Spatial hash or sweep-and-prune for broadphase
- SAT or GJK for narrow phase if you want rotated rect collisions
- Simpler: treat each char as a circle with radius = max(width, height) / 2

### The renderer

```ts
function render(ctx: CanvasRenderingContext2D, world: PhysicsWorld) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  // sort by z for correct overlap, skip dead bodies
  const visible = world.bodies.filter(b => !b.dead).sort((a, b) => a.z - b.z)
  let lastFont = ''
  for (const body of visible) {
    if (body.font !== lastFont) {
      ctx.font = body.font
      lastFont = body.font
    }
    ctx.save()
    ctx.translate(body.position.x, body.position.y)
    ctx.rotate(body.angle)
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText(body.char, 0, 0)
    ctx.restore()
  }
}
```

### The builder API (user-facing)

```ts
const world = createWorld({ gravity: { x: 0, y: 980 } })

// Create a swinging word
const sign = world.createText("OPEN", { font: '32px serif', mass: 2 })
  .layout('horizontal', { spacing: 2 })   // arrange chars in a row
  .pinAt(0, 'top')                         // pin first char at top
  .pinAt(-1, 'top')                        // pin last char at top
  .connectAll('spring', { stiffness: 300 }) // spring chain between adjacent

// Create a pile
const pile = splitGraphemes("ABCDEFGH").map(c =>
  world.createChar(c, { font: '24px mono', mass: 1, position: randomAbove() })
)
// They'll fall and pile up on the floor

// Create from pretext layout (readable text that shatters)
const paragraph = world.createFromText(longText, {
  font: '16px sans-serif',
  maxWidth: 400,
  lineHeight: 24,
  connections: 'weld' // all chars welded initially
})
// Later: paragraph.shatter(impulse)
```

## Missing pieces worth designing upfront

### Simulation loop and timestep

The doc above shows `integrate()` but not the frame loop. This matters for stability:

```ts
const FIXED_DT = 1 / 120          // physics at 120Hz (2 substeps per 60fps frame)
const MAX_SUBSTEPS = 4             // cap spiral-of-death
let accumulator = 0

function frame(timestamp: number) {
  const frameDt = Math.min((timestamp - lastTimestamp) / 1000, 0.05) // cap at 50ms
  lastTimestamp = timestamp
  accumulator += frameDt

  let steps = 0
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    step(world, FIXED_DT)
    accumulator -= FIXED_DT
    steps++
  }

  // alpha could interpolate between previous and current state for visual smoothness,
  // but for simplicity the renderer just draws current positions
  render(ctx, world)
  requestAnimationFrame(frame)
}
```

Fixed timestep keeps springs stable. Variable dt makes stiff springs explode on frame drops.

### Compound bodies (word-as-one-body)

Per-char physics is expensive and often unnecessary. A word or segment can be a single rigid body with its chars as decoration:

```ts
type CompoundBody = {
  id: number
  mass: number
  position: Vec2
  velocity: Vec2
  angle: number
  angularVelocity: number
  // collision shape is the bounding rect of all chars combined
  width: number
  height: number
  // sub-chars are positioned relative to body center — no physics, just offsets
  chars: { char: string; localOffset: Vec2; font: string }[]
}
```

This gives you three granularity levels:
- **Paragraph**: one body, all chars decorative (cheapest — good for "a block falls")
- **Word**: one body per word, chars decorative within (medium — good for "words scatter but stay intact")
- **Character**: one body per char, fully independent (most expensive — good for "letters explode")

You can also **transition between levels**: start as a compound word-body, then on break event, decompose into per-char bodies at the same positions/velocities.

### Collision filtering

Chars in the same word shouldn't collide with each other (they'd overlap at rest). The `collisionGroup` and `collisionMask` fields handle this:

Typical setup:
- All chars in "HELLO" get `collisionGroup: 1`
- All chars in "WORLD" get `collisionGroup: 2`
- Both have `collisionMask: 0xFFFFFFFF` (collide with everything)
- Same-group pairs are skipped in broadphase

### Body sleeping

When bodies settle (velocity and angular velocity below threshold for N frames), stop simulating them:

```ts
const SLEEP_THRESHOLD_VEL = 0.5
const SLEEP_THRESHOLD_ANG = 0.01
const SLEEP_DELAY_FRAMES = 60

function checkSleep(body: CharBody) {
  if (magnitude(body.velocity) < SLEEP_THRESHOLD_VEL &&
      Math.abs(body.angularVelocity) < SLEEP_THRESHOLD_ANG) {
    body.sleepTimer++
    if (body.sleepTimer >= SLEEP_DELAY_FRAMES) body.sleeping = true
  } else {
    body.sleepTimer = 0
    body.sleeping = false
  }
}

// Wake connected bodies when one is disturbed
function wake(body: CharBody, world: PhysicsWorld) {
  if (!body.sleeping) return // already awake — stops infinite recursion
  body.sleeping = false
  body.sleepTimer = 0
  for (const conn of world.connections) {
    if (conn.broken) continue
    if (conn.a === body.id) wake(world.bodies[conn.b], world)
    if (conn.b === body.id) wake(world.bodies[conn.a], world)
  }
}
```

Critical for scenes with 200+ chars — after things settle, you're doing almost no work per frame.

### User interaction (input → forces)

The doc shows forces but not how the user drives them:

```ts
type Interaction =
  | { type: 'drag'; bodyId: number; target: Vec2; stiffness: number }
  | { type: 'impulse'; position: Vec2; radius: number; strength: number }
  | { type: 'attractor'; position: Vec2; strength: number; falloff: 'linear' | 'quadratic' }
  | { type: 'repulsor'; position: Vec2; strength: number; radius: number }
  | { type: 'wind'; direction: Vec2; strength: number; region?: Rect }

function applyInteractions(world: PhysicsWorld, interactions: Interaction[]) {
  for (const i of interactions) {
    switch (i.type) {
      case 'drag': {
        const body = world.bodies[i.bodyId]
        if (body.mass === Infinity || body.dead) break
        if (body.sleeping) wake(body, world)
        const dx = i.target.x - body.position.x
        const dy = i.target.y - body.position.y
        body.force.x += dx * i.stiffness
        body.force.y += dy * i.stiffness
        break
      }
      case 'impulse': {
        for (const body of world.bodies) {
          if (body.mass === Infinity) continue // static bodies don't respond
          const dx = body.position.x - i.position.x
          const dy = body.position.y - i.position.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < i.radius && dist > 0) {
            const factor = (1 - dist / i.radius) * i.strength / body.mass
            body.velocity.x += (dx / dist) * factor
            body.velocity.y += (dy / dist) * factor
            wake(body, world)
          }
        }
        break
      }
      case 'attractor': {
        for (const body of world.bodies) {
          if (body.mass === Infinity || body.dead) continue
          const dx = i.position.x - body.position.x
          const dy = i.position.y - body.position.y
          const distSq = dx * dx + dy * dy
          const dist = Math.sqrt(distSq)
          if (dist < 1) continue
          const f = i.falloff === 'linear'
            ? i.strength / dist
            : i.strength / distSq
          body.force.x += (dx / dist) * f
          body.force.y += (dy / dist) * f
          if (body.sleeping) wake(body, world)
        }
        break
      }
      // ...wind, repulsor similarly
    }
  }
}
```

### Solver iterations

A single constraint-solve pass is jittery for stacking. You need multiple iterations:

```ts
function step(world: PhysicsWorld, dt: number) {
  applyInteractions(world, activeInteractions)
  for (const body of world.bodies) {
    if (!body.sleeping && !body.dead) integrate(body, dt)
  }
  // Multiple passes stabilize stacking and rigid chains
  const ITERATIONS = 4
  for (let i = 0; i < ITERATIONS; i++) {
    solveConstraints(world)
    solveCollisions(world)
    if (world.bounds) {
      for (const body of world.bodies) {
        if (!body.dead && body.mass !== Infinity) solveBounds(body, world.bounds)
      }
    }
  }
  for (const body of world.bodies) {
    if (!body.dead && body.mass !== Infinity) checkSleep(body)
  }
}
```

More iterations = stiffer/more stable, but costs more. 4 is a good default; 8 for rigid towers, 2 for loose cloth.

### Performance budget

Rough cost at 60fps on a modern machine:

| Char count | Granularity | Substeps | Feasible? |
|-----------|-------------|----------|-----------|
| 50 | per-char | 2 | trivial |
| 200 | per-char | 2 | easy |
| 500 | per-char | 2 | fine with spatial hash + sleeping |
| 2000 | per-char | 2 | needs sleeping + broadphase, push WebGL |
| 2000 | per-word (~300 bodies) | 2 | comfortable |
| 5000+ | per-char | any | WebGL + WASM physics |

The bottleneck is collision broadphase (N² without spatial structure) and the canvas `fillText` calls (each one is expensive with save/restore/translate/rotate). Mitigations:
- **Spatial hash** with cell size = largest char width: O(N) broadphase
- **Batch rendering** by font: set `ctx.font` once, draw all same-font chars, avoid redundant state changes
- **Skip offscreen bodies**: frustum cull before drawing
- **Object pooling**: avoid GC pressure from Vec2 allocations in the hot loop

## Architecture decision

```
┌─────────────────────────────────────────────────────────────────┐
│  char-physics engine                                            │
│                                                                 │
│  ┌────────────┐  ┌───────────────┐  ┌───────────────────────┐  │
│  │ Builder    │  │ Physics Core  │  │ Renderer              │  │
│  │            │  │               │  │                       │  │
│  │ .createChar│  │ integrate()   │  │ canvas ctx.fillText() │  │
│  │ .createText│  │ solveRigid()  │  │ or WebGL MSDF quads   │  │
│  │ .connect() │  │ solveSpring() │  │                       │  │
│  │ .pin()     │  │ collide()     │  │                       │  │
│  │ .layout()  │  │               │  │                       │  │
│  └─────┬──────┘  └───────┬───────┘  └───────────┬───────────┘  │
│        │                  │                      │              │
│        │     pretext (optional)                  │              │
│        │     ┌─────────────────────┐             │              │
│        └────▶│ measureText widths  │─────────────┘              │
│              │ layout rest positions│                            │
│              │ (only when text-    │                             │
│              │  shaped formations) │                             │
│              └─────────────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

## Gotchas that will bite you

### Grapheme != code point

Never use `.split('')` for text decomposition — it breaks on emoji (👨‍👩‍👧‍👦 is one grapheme but 7 code points) and composed scripts. All the examples above use this helper:

```ts
function splitGraphemes(text: string): string[] {
  return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(s => s.segment)
}
// "Hello 👨‍👩‍👧‍👦!" → ["H", "e", "l", "l", "o", " ", "👨‍👩‍👧‍👦", "!"]
```

This is one place pretext's infrastructure directly helps — it already does grapheme segmentation internally.

### Rendering order (z-index)

When chars overlap (piles, explosions), you need a draw order. The `z` field on `CharBody` controls this (sorted in the renderer above). Strategies for assigning z:
- **Creation order** (simple, stable): `z = id`
- **Y-sort** (natural for piles): `z = position.y` updated each frame
- **Explicit** (dragged on top): set `z = 1000` on drag start, restore on drop
- **Velocity-based** (depth in explosions): `z = magnitude(velocity)`

### Body lifecycle

Real scenes need spawn/despawn:

```ts
// Spawn: typewriter effect, spawning chars one at a time with entry velocity
function spawn(world: PhysicsWorld, char: string, opts: SpawnOpts): CharBody {
  const body = createBody(char, opts)
  world.bodies.push(body)
  return body
}

// Despawn: remove offscreen bodies, faded-out chars, or destroyed fragments
function despawn(world: PhysicsWorld, bodyId: number) {
  // break all connections to this body
  for (const conn of world.connections) {
    if (conn.a === bodyId || conn.b === bodyId) conn.broken = true
  }
  // remove or mark as dead (pool for reuse to avoid GC)
  world.bodies[bodyId].dead = true
}

// Cleanup pass each frame — call after step()
function reap(world: PhysicsWorld) {
  if (!world.bounds) return
  // Remove bodies below the kill plane (200px buffer below bounds)
  const killY = world.bounds.y + world.bounds.height + 200
  for (const body of world.bodies) {
    if (!body.dead && body.position.y > killY) {
      despawn(world, body.id)
    }
  }
}
```

### Wall/boundary collision

The `bounds` field exists but needs an implementation note:

```ts
function solveBounds(body: CharBody, bounds: Rect) {
  const hw = body.width / 2, hh = body.height / 2
  if (body.position.x - hw < bounds.x) {
    body.position.x = bounds.x + hw
    body.velocity.x *= -body.restitution
  }
  if (body.position.x + hw > bounds.x + bounds.width) {
    body.position.x = bounds.x + bounds.width - hw
    body.velocity.x *= -body.restitution
  }
  if (body.position.y + hh > bounds.y + bounds.height) {
    body.position.y = bounds.y + bounds.height - hh
    body.velocity.y *= -body.restitution
    // friction on floor
    body.velocity.x *= (1 - body.friction)
    body.angularVelocity *= (1 - body.friction)
  }
}
```

## Conclusion

This is absolutely doable. The engine is **mostly independent of pretext** — it's a 2D physics sim where the visual primitive is a glyph instead of a polygon. Pretext's role is narrow but valuable:

1. **Measurement** — accurate glyph bounding boxes (especially for emoji/CJK)
2. **Formation generator** — when you want objects that start/end as readable text
3. **Reflow targets** — spring-back-to-paragraph after disturbance

The physics core, constraint solver, collision system, and renderer are all new code. You could package this as a standalone library that *optionally* accepts pretext prepared data for text-shaped formations, but works fine with manually positioned characters too.

Estimated scope for a solid v1:
- Physics core (verlet + constraints + collision): ~500-800 lines
- Builder API: ~200-300 lines
- Canvas renderer: ~50-100 lines
- Pretext integration (text → formation): ~100-150 lines
- Total: ~1000-1400 lines of focused code
