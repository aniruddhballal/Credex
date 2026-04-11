import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth'
import { sanitiseBody } from '../middleware/sanitise'

// Controllers — reuse existing, no duplication
import {
  listLoanApplications,
  getLoanApplicationById,
  requestDocuments,
  approveLoan,
  rejectLoan,
} from '../controllers/loan.controller'
import { getDocumentUrl } from '../controllers/document.controller'
import { getUnderwriterDashboard } from '../controllers/dashboard.controller'

const router = Router()

const uw = requireRole('underwriter', 'system_admin')

// GET /api/underwriter/dashboard
router.get('/dashboard', authenticate, uw, getUnderwriterDashboard)

// GET /api/underwriter/queue  (alias for GET /api/loans filtered for underwriter)
router.get('/queue', authenticate, uw, listLoanApplications)

// GET /api/underwriter/applications/:id  (alias for GET /api/loans/:id)
router.get('/applications/:id', authenticate, uw, getLoanApplicationById)

// POST /api/underwriter/applications/:id/request-docs
// Note: frontend sends "request-docs", backend controller is "requestDocuments"
router.post('/applications/:id/request-docs', authenticate, uw, sanitiseBody, requestDocuments)

// POST /api/underwriter/applications/:id/approve
router.post('/applications/:id/approve', authenticate, uw, sanitiseBody, approveLoan)

// POST /api/underwriter/applications/:id/reject
router.post('/applications/:id/reject', authenticate, uw, sanitiseBody, rejectLoan)

// GET /api/underwriter/documents/:id/view  (alias for GET /api/documents/:id/url)
router.get('/documents/:id/view', authenticate, uw, getDocumentUrl)

export default router