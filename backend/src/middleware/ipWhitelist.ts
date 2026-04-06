import { Request, Response, NextFunction } from 'express'

const getAllowedIps = (): string[] => {
  const envIps = process.env.ADMIN_ALLOWED_IPS || '127.0.0.1,::1'
  return envIps.split(',').map((ip) => ip.trim())
}

export const ipWhitelistMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    ''

  const allowedIps = getAllowedIps()

  if (!allowedIps.includes(clientIp)) {
    res.status(403).json({ success: false, message: 'Access denied' })
    return
  }

  next()
}