import { Router } from 'express'
import {
  createCompany,
  getMyCompany,
  getCompanyById,
  updateMyCompany,
  listCompanies,
} from '../controllers/company.controller'
import { authenticate } from '../middleware/auth'
import { sanitiseBody } from '../middleware/sanitise'

const router = Router()

// Public
router.get('/', listCompanies)
router.get('/:id', getCompanyById)

// Authenticated
router.use(authenticate)
router.post('/', sanitiseBody, createCompany)
router.get('/me/profile', getMyCompany)
router.patch('/me/profile', sanitiseBody, updateMyCompany)

export default router