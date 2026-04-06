import { Router } from 'express'
import {
  createLoanApplication,
  submitLoanApplication,
  listLoanApplications,
  getLoanApplicationById,
  assignUnderwriter,
  requestDocuments,
  approveLoan,
  rejectLoan,
} from '../controllers/loan.controller'
import { authenticate, requireRole } from '../middleware/auth'
import { sanitiseBody } from '../middleware/sanitise'

const router = Router()

router.use(authenticate)

router.get('/', listLoanApplications)
router.get('/:id', getLoanApplicationById)
router.post('/', sanitiseBody, createLoanApplication)
router.post('/:id/submit', submitLoanApplication)

// Underwriter actions
router.patch('/:id/assign', requireRole('underwriter', 'system_admin'), assignUnderwriter)
router.post('/:id/request-documents', sanitiseBody, requireRole('underwriter', 'system_admin'), requestDocuments)
router.post('/:id/approve', sanitiseBody, requireRole('underwriter', 'system_admin'), approveLoan)
router.post('/:id/reject', sanitiseBody, requireRole('underwriter', 'system_admin'), rejectLoan)

export default router