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
