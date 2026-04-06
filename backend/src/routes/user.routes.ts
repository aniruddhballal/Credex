import { Router } from 'express'
import { getProfile, updateProfile, changePassword } from '../controllers/user.controller'
import { authenticate } from '../middleware/auth'
import { sanitiseBody } from '../middleware/sanitise'

const router = Router()

router.use(authenticate)

router.get('/profile', getProfile)
router.patch('/profile', sanitiseBody, updateProfile)
router.post('/change-password', sanitiseBody, changePassword)

export default router