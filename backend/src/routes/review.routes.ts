import { Router } from 'express'
import { submitReview, listReviews } from '../controllers/review.controller'
import { authenticate } from '../middleware/auth'
import { sanitiseBody } from '../middleware/sanitise'

const router = Router()

router.get('/', listReviews)
router.post('/', authenticate, sanitiseBody, submitReview)

export default router