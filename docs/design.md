# Physics Engine — System Design

## Design principles

1. **Decoupled** — physics knows nothing about text; rendering knows nothing about physics internals. Pretext integration is one optional bridge module.
2. **Data-oriented** — bodies and connections are plain arrays of numbers. No class hierarchies, no inheritance. Easy to serialize, profile, and extend.
3. **Extensible** — new force types, constraint types, and body properties are added by writing new solver functions that operate on the same arrays. No core changes needed.
4. **Simple** — each file does one thing. The entire engine is < 1500 lines across ~10 small files.
5. **Compatible** — lives in `src/physics/`, ships as `@chenglou/pretext/physics` via a new package export. Uses `.js` import specifiers like the rest of pretext.

## Package integration

```jsonc
// package.json additions
{
  "exports": {
    "./physics": {
      "types": "./dist/physics/index.d.ts",
      "import": "./dist/physics/index.js"
    }
  }
}
```

The physics module has zero imports from pretext's core. The bridge (`src/physics/pretext-bridge.ts`) imports from `../layout.js` to convert prepared text into body formations. This keeps the dependency one-way: bridge → pretext, never pretext → physics.

## File structure

```
src/physics/
├── index.ts              — public re-exports
├── types.ts              — all type definitions (Vec2, Body, Connection, World, Interaction)
├── world.ts              — world creation, body/connection add/remove, reap
├── integrator.ts         — semi-implicit Euler integration
├── constraints.ts        — constraint solvers (rigid, spring, rope, weld, hinge, slider)
├── collision.ts          — broadphase (spatial hash) + narrowphase (AABB/circle)
├── bounds.ts             — wall/boundary collision
├── interactions.ts       — force applicators (drag, impulse, attractor, repulsor, wind)
├── sleep.ts              — sleeping logic (check + wake propagation)
├── renderer.ts           — canvas 2D renderer
└── pretext-bridge.ts     — pretext integration (text → bodies, resize → rest positions)
```

## Type definitions (`types.ts`)

```ts
export type Vec2 = { x: number; y: number }

export type Rect = { x: number; y: number; width: number; height: number }

export type Body = {
  id: number
  // visual
  char: string
  font: string
  z: number

  // physical properties
  mass: number           // Infinity = static
  restitution: number
  friction: number
  width: number
  height: number

  // state
  position: Vec2
  velocity: Vec2
  angle: number
  angularVelocity: number
  force: Vec2
  torque: number

  // collision
  collisionGroup: number
  collisionMask: number

  // sleeping
  sleeping: boolean
  sleepTimer: number

  // lifecycle
  dead: boolean
}

export type ConnectionType = 'rigid' | 'spring' | 'rope' | 'hinge' | 'weld' | 'slider'

export type ConnectionBase = {
  id: number
  a: number
  b: number
  broken: boolean
  breakForce?: number
  onBreak?: () => void
}

export type RigidConnection = ConnectionBase & { type: 'rigid'; length: number }
export type SpringConnection = ConnectionBase & { type: 'spring'; stiffness: number; damping: number; restLength: number }
export type RopeConnection = ConnectionBase & { type: 'rope'; maxLength: number }
export type HingeConnection = ConnectionBase & { type: 'hinge'; anchor: Vec2; motorSpeed?: number }
export type WeldConnection = ConnectionBase & { type: 'weld'; referenceAngle: number }
export type SliderConnection = ConnectionBase & { type: 'slider'; axis: Vec2; limits?: [number, number] }

export type Connection =
  | RigidConnection
  | SpringConnection
  | RopeConnection
  | HingeConnection
  | WeldConnection
  | SliderConnection

export type Interaction =
  | { type: 'drag'; bodyId: number; target: Vec2; stiffness: number }
  | { type: 'impulse'; position: Vec2; radius: number; strength: number }
  | { type: 'attractor'; position: Vec2; strength: number; falloff: 'linear' | 'quadratic' }
  | { type: 'repulsor'; position: Vec2; strength: number; radius: number }
  | { type: 'wind'; direction: Vec2; strength: number; region?: Rect }

export type WorldConfig = {
  gravity: Vec2
  bounds?: Rect
  iterations?: number        // constraint solver iterations per step (default: 4)
  damping?: number           // global velocity damping (default: 0.99)
  sleepThresholdVel?: number // (default: 0.5)
  sleepThresholdAng?: number // (default: 0.01)
  sleepDelay?: number        // frames before sleeping (default: 60)
}

export type World = {
  bodies: Body[]
  connections: Connection[]
  config: Required<WorldConfig>
  nextBodyId: number
  nextConnectionId: number
}
```

### Why this shape

- **Flat body type** — every property on the body itself. No nested objects besides `Vec2` (position, velocity, force). This means you can later swap to typed arrays (SoA) for SIMD without changing the solver APIs.
- **Connection as discriminated union** — each solver function pattern-matches on `type`. Adding a new constraint is: define the type variant, write its solver function, register it in the dispatch.
- **Interaction as a tagged union** — same extensibility pattern. New forces (magnetism, buoyancy, turbulence) are new union members + new handler functions.
- **World is plain data** — no methods. Every operation is a free function that takes `World` as the first argument. This makes tree-shaking trivial and testing easy.

## Core modules

### `world.ts` — world lifecycle

```ts
export function createWorld(config: WorldConfig): World
export function createBody(world: World, char: string, font: string, opts?: Partial<Body>): Body
export function createConnection(world: World, conn: Omit<Connection, 'id' | 'broken'>): Connection
export function removeBody(world: World, bodyId: number): void
export function removeConnection(world: World, connId: number): void
export function reap(world: World): void  // remove dead bodies + broken connections
```

`createBody` measures `width`/`height` via `canvas.measureText` at creation time. Defaults: mass=1, restitution=0.3, friction=0.2, z=0, sleeping=false, dead=false, collisionGroup=0, collisionMask=0xFFFFFFFF.

### `integrator.ts` — time stepping

```ts
export function integrate(body: Body, gravity: Vec2, damping: number, dt: number): void
```

Semi-implicit Euler. Computes moment of inertia internally as `mass * (w² + h²) / 12`. Skips if `mass === Infinity` or `body.dead` or `body.sleeping`.

### `constraints.ts` — constraint solving

```ts
export function solveConstraint(conn: Connection, bodies: Body[]): void
export function solveRigid(conn: RigidConnection, bodies: Body[]): number
export function solveSpring(conn: SpringConnection, bodies: Body[]): number
export function solveRope(conn: RopeConnection, bodies: Body[]): number
export function solveWeld(conn: WeldConnection, bodies: Body[]): number
export function solveHinge(conn: HingeConnection, bodies: Body[]): number
export function solveSlider(conn: SliderConnection, bodies: Body[]): number
```

Each individual solver returns the stress magnitude. The top-level `solveConstraint` dispatches by `conn.type`, checks `breakForce`, fires `onBreak`, and marks `broken = true` when the threshold is exceeded.

Adding a new constraint type:
1. Add the type to the union in `types.ts`
2. Write a `solveNewType()` function in `constraints.ts`
3. Add the case to `solveConstraint`

### `collision.ts` — collision detection and response

```ts
export type SpatialHash = { cellSize: number; cells: Map<number, number[]> }

export function createSpatialHash(cellSize: number): SpatialHash
export function updateSpatialHash(hash: SpatialHash, bodies: Body[]): void
export function detectAndResolve(hash: SpatialHash, bodies: Body[]): void
```

Broadphase: spatial hash (cell size = typical body diameter). Narrowphase: axis-aligned bounding box overlap check (rotation ignored for simplicity — good enough for text characters). Collision response: position correction + velocity reflection weighted by inverse mass.

Collision filtering rules (checked in order):
1. Skip if either body is dead or static (`mass === Infinity`)
2. Skip if both are in the same non-zero group: `a.collisionGroup === b.collisionGroup && a.collisionGroup !== 0`
3. Skip if the mask rejects: `(a.collisionMask & (1 << b.collisionGroup)) === 0` (and vice versa)

The group check handles the common case (chars in the same word don't self-collide). The mask handles advanced cases (layer A collides with layer B but not C).

### `bounds.ts` — boundary walls

```ts
export function solveBounds(body: Body, bounds: Rect): void
```

Clamps position inside bounds, reflects velocity with restitution, applies friction on floor contact.

### `interactions.ts` — external forces

```ts
export function applyInteraction(world: World, interaction: Interaction): void
export function applyInteractions(world: World, interactions: Interaction[]): void
```

Each interaction type applies forces/impulses and wakes sleeping bodies as needed. Skips dead and static (`mass === Infinity`) bodies.

### `sleep.ts` — sleeping

```ts
export function checkSleep(body: Body, config: Required<WorldConfig>): void
export function wake(body: Body, world: World): void
```

`wake` propagates through unbroken connections with the `if (!body.sleeping) return` recursion guard.

### `renderer.ts` — canvas 2D rendering

```ts
export function render(ctx: CanvasRenderingContext2D, world: World): void
```

Filters dead, sorts by z, batches font changes. Minimal — just `fillText` with translate/rotate per body. The renderer is intentionally thin so users can replace it with WebGL/SVG/DOM without touching physics.

### `pretext-bridge.ts` — pretext integration

```ts
import { prepareWithSegments, layoutWithLines, type PreparedTextWithSegments } from '../layout.js'

export type TextFormation = {
  prepared: PreparedTextWithSegments
  bodyIds: number[]     // maps 1:1 with graphemes in the laid-out text
  font: string
  lineHeight: number
}

export function createTextFormation(
  world: World,
  text: string,
  font: string,
  maxWidth: number,
  lineHeight: number,
  opts?: { mass?: number; connectionType?: 'spring' | 'rigid' | 'weld'; breakForce?: number }
): TextFormation

export function updateRestPositions(
  world: World,
  formation: TextFormation,
  maxWidth: number
): void
```

`createTextFormation`:
1. Calls `prepareWithSegments(text, font)`
2. Calls `layoutWithLines(prepared, maxWidth, lineHeight)`
3. For each line, iterates graphemes via `Intl.Segmenter`, measures each, creates a body at the correct (x, y)
4. Connects adjacent chars within the same line (using the chosen connection type)
5. Returns the formation handle for later resize updates

`updateRestPositions`:
1. Re-runs `layoutWithLines` with the new `maxWidth`
2. For each body in the formation, computes its new target position from the new layout
3. Users can then apply return-to-rest springs in their frame loop

## The step function (`step.ts`)

The main simulation tick:

```ts
import { integrate } from './integrator.js'
import { solveConstraint } from './constraints.js'
import { createSpatialHash, updateSpatialHash, detectAndResolve, type SpatialHash } from './collision.js'
import { solveBounds } from './bounds.js'
import { applyInteractions } from './interactions.js'
import { checkSleep } from './sleep.js'
import type { World, Interaction } from './types.js'

let hash: SpatialHash | null = null

export function step(world: World, dt: number, interactions?: Interaction[]): void {
  if (interactions && interactions.length > 0) {
    applyInteractions(world, interactions)
  }

  for (const body of world.bodies) {
    if (!body.sleeping && !body.dead) {
      integrate(body, world.config.gravity, world.config.damping, dt)
    }
  }

  if (!hash) hash = createSpatialHash(24)
  updateSpatialHash(hash, world.bodies)

  for (let i = 0; i < world.config.iterations; i++) {
    for (const conn of world.connections) {
      if (!conn.broken) solveConstraint(conn, world.bodies)
    }
    detectAndResolve(hash, world.bodies)
    if (world.config.bounds) {
      for (const body of world.bodies) {
        if (!body.dead && body.mass !== Infinity) {
          solveBounds(body, world.config.bounds)
        }
      }
    }
  }

  for (const body of world.bodies) {
    if (!body.dead && body.mass !== Infinity) {
      checkSleep(body, world.config)
    }
  }
}
```

## Public API (`index.ts`)

```ts
// Core
export { createWorld, createBody, createConnection, removeBody, removeConnection, reap } from './world.js'
export { step } from './step.js'
export { render } from './renderer.js'

// Pretext bridge
export { createTextFormation, updateRestPositions, type TextFormation } from './pretext-bridge.js'

// Types
export type {
  Vec2, Rect, Body, Connection, ConnectionType, ConnectionBase,
  RigidConnection, SpringConnection, RopeConnection,
  HingeConnection, WeldConnection, SliderConnection,
  Interaction, WorldConfig, World,
} from './types.js'

// Utilities (exposed for advanced users who want custom step loops)
export { wake } from './sleep.js'
export { integrate } from './integrator.js'
export { solveConstraint } from './constraints.js'
export { applyInteraction } from './interactions.js'
export { solveBounds } from './bounds.js'
export { createSpatialHash, updateSpatialHash, detectAndResolve } from './collision.js'
```

## Extension patterns

### Adding a new body property

Example: adding `opacity` for fade-out effects.

1. Add `opacity: number` to `Body` in `types.ts`
2. Set default in `createBody` (`opacity: 1`)
3. Use it in `renderer.ts` (`ctx.globalAlpha = body.opacity`)
4. Optionally animate it in userland (decrement per frame, despawn when 0)

No existing code changes required. The renderer and physics are decoupled — physics doesn't read `opacity`, renderer doesn't write `velocity`.

### Adding a new constraint type

Example: adding a `range` constraint (min/max distance).

1. Add to the union in `types.ts`:
   ```ts
   export type RangeConnection = ConnectionBase & { type: 'range'; minLength: number; maxLength: number }
   ```
2. Add `RangeConnection` to the `Connection` union
3. Write `solveRange()` in `constraints.ts`
4. Add `case 'range':` to `solveConstraint`

### Adding a new force type

Example: adding `buoyancy` (upward force proportional to submerged area).

1. Add to the `Interaction` union in `types.ts`:
   ```ts
   | { type: 'buoyancy'; waterLevel: number; density: number }
   ```
2. Add handler case in `applyInteraction` in `interactions.ts`

### Swapping the renderer

The renderer is one stateless function. Replace it entirely:

```ts
import type { World } from '@chenglou/pretext/physics'

function myWebGLRenderer(gl: WebGLRenderingContext, world: World) {
  // MSDF text atlas, instanced quads, etc.
}
```

### Compound bodies (future)

For word-level physics (fewer bodies, cheaper):

1. Create one `Body` per word (bounding box = sum of char widths × line height)
2. Store per-char offsets as external metadata (not on `Body`)
3. In a custom renderer, draw each character at its local offset from body center

This is a userland pattern — no core changes. If it becomes common enough, add a `CompoundBody` type and a `renderCompound()` helper. The physics core only ever sees `Body[]`.

## Data flow

```
User code                    Physics engine                 Pretext
─────────                    ──────────────                 ───────
                             createWorld()
                                 │
createTextFormation() ──────────►├── prepareWithSegments() ◄─────┐
                                │   layoutWithLines()       ◄─────┘
                                │   createBody() × N
                                │   createConnection() × N
                                ▼
              ┌─── step(world, dt, interactions)
              │         │
              │    integrate() ── per body
              │    solveConstraint() ── per connection × iterations
              │    detectAndResolve() ── broadphase + narrowphase
              │    solveBounds() ── per body
              │    checkSleep() ── per body
              │         │
              │         ▼
              │    render(ctx, world) ── fillText per visible body
              │         │
              └─── requestAnimationFrame
                        │
              on resize: updateRestPositions(world, formation, newWidth)
```

## Frame loop (userland, not engine code)

```ts
import { createWorld, createTextFormation, step, render } from '@chenglou/pretext/physics'

const canvas = document.querySelector('canvas')!
const ctx = canvas.getContext('2d')!

const world = createWorld({ gravity: { x: 0, y: 980 }, bounds: { x: 0, y: 0, width: 800, height: 600 } })

const formation = createTextFormation(world, "Hello physics!", '24px sans-serif', 400, 32, {
  connectionType: 'spring',
  breakForce: 500
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

  render(ctx, world)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
```

The frame loop is userland, not engine code. This keeps the engine testable (call `step` deterministically in tests) and usable in non-browser contexts (pass a mock canvas, or skip rendering entirely).

## Invariants

- `body.id` equals its index in `world.bodies`. `removeBody` tombstones (`dead = true`) rather than splicing, so connection references stay valid.
- `conn.a` and `conn.b` are body IDs (indices into `world.bodies`).
- `dead === true` means skipped everywhere (integrate, collide, render, sleep). Connections to dead bodies are auto-broken in `reap()`.
- `broken === true` means the constraint is permanently inactive. It stays in the array for index stability but is skipped by all solvers.
- `force` and `torque` are transient accumulators — written by interactions/springs, consumed and zeroed by `integrate()`. Never read them outside of integrate.
- The spatial hash is rebuilt from scratch each step. Simpler than incremental updates, fast enough for < 2000 bodies.
- `gravity` is in pixels/second². A value of `{ x: 0, y: 980 }` gives Earth-like feel at typical screen scales.

## Testing strategy

Tests are co-located with source (matching the existing `src/layout.test.ts` convention) and run with `bun test`. The build config (`tsconfig.build.json`) already excludes `*.test.ts` from `dist/`. One test file per module:

```
src/physics/
├── integrator.test.ts
├── constraints.test.ts
├── collision.test.ts
├── bounds.test.ts
├── interactions.test.ts
├── sleep.test.ts
├── world.test.ts
└── pretext-bridge.test.ts
```

Every module gets unit tests before integration work begins — physics bugs are subtle and compound across frames, so catching them at the solver level is critical.

### Required test coverage per module

**`integrator.ts`**:
- A body at rest with no forces stays at rest
- Gravity accelerates a body downward at the correct rate
- Static bodies (`mass: Infinity`) are unaffected by forces/gravity
- Torque produces angular acceleration proportional to 1/inertia
- Force and torque are zeroed after integration

**`constraints.ts`**:
- Rigid: two bodies at wrong distance converge to `length` over N steps
- Rigid: one static + one dynamic body — only the dynamic body moves
- Spring: displaced bodies oscillate around `restLength`; damping brings them to rest
- Spring: force magnitude matches `stiffness * displacement` analytically
- Rope: no effect when distance < maxLength; corrects when taut
- Weld: maintains both distance and relative angle
- BreakForce: connection snaps when stress exceeds threshold
- BreakForce: `onBreak` callback fires exactly once
- BreakForce: broken connection is skipped in subsequent steps

**`collision.ts`**:
- Two overlapping bodies are separated after one solve pass
- Non-overlapping bodies are unaffected
- Same `collisionGroup` (non-zero) bodies do not collide
- Dead bodies are excluded from collision
- Spatial hash correctly bins bodies and finds neighbors

**`bounds.ts`**:
- Body clamped inside bounds on all four sides
- Velocity reflected with correct restitution on wall contact
- Floor friction reduces horizontal velocity and angular velocity

**`interactions.ts`**:
- Drag: force proportional to distance from target
- Impulse: bodies within radius receive velocity; outside radius unaffected
- Impulse: force falloff is linear with distance
- Attractor: force direction points toward attractor position
- Static and dead bodies are unaffected by all interactions
- Sleeping bodies are woken by interactions

**`sleep.ts`**:
- Body falls asleep after `sleepDelay` frames below threshold
- Any velocity above threshold resets the timer
- `wake` propagates through connected bodies
- `wake` does not infinite-loop on cyclic connections

**`world.ts`**:
- `createBody` assigns sequential IDs matching array index
- `removeBody` sets `dead = true`, does not splice
- `reap` breaks connections to dead bodies

**`pretext-bridge.ts`**:
- Known text + font + width produces expected body count (one per grapheme)
- Body positions match what `layoutWithLines` would produce
- Adjacent bodies on the same line are connected
- `updateRestPositions` changes body targets when width changes

### Test discipline

- Every new module or feature starts with a failing test before implementation
- Tests must not depend on frame timing or `requestAnimationFrame`
- Tests must not depend on a real canvas — use `OffscreenCanvas` or mock `measureText` with fixed widths
- Assertions use numeric tolerance (`±0.001`) since floating point accumulates across steps
- Each test is self-contained: creates its own world, steps it, asserts
