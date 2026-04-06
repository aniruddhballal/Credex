import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import {
  register,
  login,
  refreshToken,
  verifyEmail,
  forgotPassword,
  resetPassword,
  logout,
  getMe,
} from '../controllers/auth.controller'
import { authenticate } from '../middleware/auth'
import { sanitiseBody } from '../middleware/sanitise'

const router = Router()

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

router.post('/register', authLimiter, sanitiseBody, register)
router.post('/login', authLimiter, sanitiseBody, login)
router.post('/refresh', refreshToken)
router.get('/verify-email', verifyEmail)
router.post('/forgot-password', authLimiter, sanitiseBody, forgotPassword)
router.post('/reset-password', authLimiter, sanitiseBody, resetPassword)
router.post('/logout', logout)
router.get('/me', authenticate, getMe)

export default router