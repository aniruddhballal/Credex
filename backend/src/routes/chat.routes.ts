import { Router } from 'express'
import { sendMessage, getThread } from '../controllers/chat.controller'
import { authenticate } from '../middleware/auth'
import { sanitiseBody } from '../middleware/sanitise'

const router = Router()

router.use(authenticate)

router.get('/', getThread)
router.post('/', sanitiseBody, sendMessage)

export default router