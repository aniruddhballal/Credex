import { Request, Response, NextFunction } from 'express'
import xss from 'xss'

const sanitiseValue = (value: unknown): unknown => {
  if (typeof value === 'string') return xss(value)
  if (Array.isArray(value)) return value.map(sanitiseValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitiseValue(v)])
    )
  }
  return value
}

export const sanitiseBody = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.body) req.body = sanitiseValue(req.body)
  next()
}