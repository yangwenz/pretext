import { prepareWithSegments, layoutWithLines, type PreparedTextWithSegments } from '../layout.js'
import { createBody, createConnection } from './world.js'
import type { Body, World } from './types.js'

export type TextFormation = {
  prepared: PreparedTextWithSegments
  bodyIds: number[]
  font: string
  lineHeight: number
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

function splitGraphemes(text: string): string[] {
  return [...graphemeSegmenter.segment(text)].map(s => s.segment)
}

export function createTextFormation(
  world: World,
  text: string,
  font: string,
  maxWidth: number,
  lineHeight: number,
  opts?: { mass?: number; connectionType?: 'spring' | 'rigid' | 'weld'; breakForce?: number }
): TextFormation {
  const prepared = prepareWithSegments(text, font)
  const result = layoutWithLines(prepared, maxWidth, lineHeight)
  const bodyIds: number[] = []
  const mass = opts?.mass ?? 1
  const connectionType = opts?.connectionType ?? 'spring'

  let canvas: OffscreenCanvas | null = null
  let ctx: OffscreenCanvasRenderingContext2D | null = null
  function measureChar(char: string): number {
    if (!canvas) {
      canvas = new OffscreenCanvas(1, 1)
      ctx = canvas.getContext('2d')!
      ctx.font = font
    }
    return ctx!.measureText(char).width
  }

  const fontSize = parseFloat(font)
  const charHeight = isNaN(fontSize) ? lineHeight : fontSize

  let prevBodyOnLine: Body | null = null
  for (let lineIdx = 0; lineIdx < result.lines.length; lineIdx++) {
    const line = result.lines[lineIdx]!
    const graphemes = splitGraphemes(line.text)
    const y = lineIdx * lineHeight + lineHeight / 2
    let x = 0
    prevBodyOnLine = null

    for (const grapheme of graphemes) {
      const charWidth = measureChar(grapheme)
      const body = createBody(world, grapheme, font, {
        position: { x: x + charWidth / 2, y },
        mass,
        width: charWidth,
        height: charHeight,
      })
      bodyIds.push(body.id)

      if (prevBodyOnLine) {
        const restLength = (prevBodyOnLine.width + charWidth) / 2
        const breakForce = opts?.breakForce
        switch (connectionType) {
          case 'spring':
            createConnection(world, {
              type: 'spring',
              a: prevBodyOnLine.id,
              b: body.id,
              stiffness: 300,
              damping: 10,
              restLength,
              ...(breakForce !== undefined ? { breakForce } : {}),
            })
            break
          case 'rigid':
            createConnection(world, {
              type: 'rigid',
              a: prevBodyOnLine.id,
              b: body.id,
              length: restLength,
              ...(breakForce !== undefined ? { breakForce } : {}),
            })
            break
          case 'weld':
            createConnection(world, {
              type: 'weld',
              a: prevBodyOnLine.id,
              b: body.id,
              referenceAngle: 0,
              ...(breakForce !== undefined ? { breakForce } : {}),
            })
            break
        }
      }

      prevBodyOnLine = body
      x += charWidth
    }
  }

  return { prepared, bodyIds, font, lineHeight }
}

export function updateRestPositions(
  world: World,
  formation: TextFormation,
  maxWidth: number
): void {
  const result = layoutWithLines(formation.prepared, maxWidth, formation.lineHeight)

  let canvas: OffscreenCanvas | null = null
  let ctx: OffscreenCanvasRenderingContext2D | null = null
  function measureChar(char: string): number {
    if (!canvas) {
      canvas = new OffscreenCanvas(1, 1)
      ctx = canvas.getContext('2d')!
      ctx.font = formation.font
    }
    return ctx!.measureText(char).width
  }

  let bodyIdx = 0
  for (let lineIdx = 0; lineIdx < result.lines.length; lineIdx++) {
    const line = result.lines[lineIdx]!
    const graphemes = splitGraphemes(line.text)
    const y = lineIdx * formation.lineHeight + formation.lineHeight / 2
    let x = 0

    for (const grapheme of graphemes) {
      const charWidth = measureChar(grapheme)
      const bodyId = formation.bodyIds[bodyIdx]
      if (bodyId !== undefined) {
        const body = world.bodies[bodyId]
        if (body && !body.dead) {
          body.position.x = x + charWidth / 2
          body.position.y = y
        }
      }
      x += charWidth
      bodyIdx++
    }
  }
}
