import { Router } from 'express'
import { listNotifications, markAsRead, markAllAsRead } from '../controllers/notification.controller'
import { authenticate } from '../middleware/auth'

const router = Router()

router.use(authenticate)

router.get('/', listNotifications)
router.patch('/read-all', markAllAsRead)
router.patch('/:id/read', markAsRead)

export default router