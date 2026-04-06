import jwt, { SignOptions } from 'jsonwebtoken'
import { Types } from 'mongoose'
import crypto from 'crypto'

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!

export interface AccessTokenPayload {
  userId: string
  role: string
  companyId?: string
}

export interface RefreshTokenPayload {
  userId: string
  jti: string // session token id
}

export const generateAccessToken = (payload: AccessTokenPayload): string => {
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  } as SignOptions)
}

export const generateRefreshToken = (userId: string | Types.ObjectId): { token: string; jti: string } => {
  const jti = crypto.randomUUID()
  const token = jwt.sign({ userId: userId.toString(), jti }, REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  } as SignOptions)
  return { token, jti }
}

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  return jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload
}

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  return jwt.verify(token, REFRESH_SECRET) as RefreshTokenPayload
}

export const generateVerificationToken = (): string => {
  return crypto.randomBytes(32).toString('hex')
}

export const generateResetToken = (): string => {
  return crypto.randomBytes(32).toString('hex')
}