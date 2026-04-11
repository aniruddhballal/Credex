import { Response } from 'express'

export const sendSuccess = (res: Response, data: unknown, message?: string, statusCode = 200) => {
  return res.status(statusCode).json({ success: true, data, message })
}

export const sendPaginated = (
  res: Response,
  items: unknown[],
  nextCursor: string | null,
  total?: number
) => {
  return res.json({ success: true, data: { items, nextCursor, total } })
}

export const sendError = (res: Response, message: string, statusCode = 400, code?: string) => {
  return res.status(statusCode).json({ success: false, error: message, code })
}