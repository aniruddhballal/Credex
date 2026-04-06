import { Router } from 'express'
import {
  getMyScore,
  getMyScoreHistory,
  getScoreByCompany,
  computeMyScore,
  computeScoreForCompany,
} from '../controllers/creditScore.controller'
import { authenticate, requireRole } from '../middleware/auth'

const router = Router()

router.use(authenticate)

router.get('/me', getMyScore)
router.get('/me/history', getMyScoreHistory)
router.post('/me/compute', computeMyScore)

router.get('/company/:companyId', requireRole('underwriter', 'system_admin'), getScoreByCompany)
router.post('/company/:companyId/compute', requireRole('system_admin'), computeScoreForCompany)

export default router