import { Request, Response, NextFunction } from 'express'
import { verifyAccessToken, AccessTokenPayload } from '../utils/jwt'

export interface AuthRequest extends Request {
  user?: AccessTokenPayload
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'No token provided' })
    return
  }

  const token = authHeader.split(' ')[1]
  try {
    const decoded = verifyAccessToken(token)
    // Normalise role — trim whitespace and lowercase defensively
    req.user = {
      ...decoded,
      role: decoded.role?.trim().toLowerCase() as AccessTokenPayload['role'],
    }
    next()
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' })
  }
}

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const userRole = req.user?.role

    // Diagnostic logging — remove once issue is resolved
    console.log('[requireRole] PATH:', req.method, req.path)
    console.log('[requireRole] EXPECTED roles:', JSON.stringify(roles))
    console.log('[requireRole] ACTUAL role:', JSON.stringify(userRole))
    console.log('[requireRole] req.user:', JSON.stringify(req.user))
    console.log('[requireRole] match:', userRole !== undefined && roles.includes(userRole))

    if (!userRole || !roles.includes(userRole)) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' })
      return
    }
    next()
  }
}