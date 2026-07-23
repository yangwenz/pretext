export type Vec2 = { x: number; y: number }

export type Rect = { x: number; y: number; width: number; height: number }

export type Body = {
  id: number
  char: string
  font: string
  z: number

  mass: number
  restitution: number
  friction: number
  width: number
  height: number

  position: Vec2
  velocity: Vec2
  angle: number
  angularVelocity: number
  force: Vec2
  torque: number

  collisionGroup: number
  collisionMask: number

  sleeping: boolean
  sleepTimer: number

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
  iterations?: number
  damping?: number
  sleepThresholdVel?: number
  sleepThresholdAng?: number
  sleepDelay?: number
}

export type World = {
  bodies: Body[]
  connections: Connection[]
  config: Required<WorldConfig>
  nextBodyId: number
  nextConnectionId: number
}
