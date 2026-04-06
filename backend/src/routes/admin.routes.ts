import { Router } from 'express'
import {
  listUsers,
  deleteUser,
  listCompaniesAdmin,
  verifyCompany,
  listLoanTypes,
  createLoanType,
  updateLoanType,
  createRestorationRequest,
  listRestorationRequests,
  approveRestoration,
  rejectRestoration,
  listAuditLogs,
} from '../controllers/admin.controller'
import { authenticate, requireRole } from '../middleware/auth'
import { sanitiseBody } from '../middleware/sanitise'

const router = Router()

// All admin routes require authentication + system_admin role
// (IP whitelist is enforced at server.ts middleware level before these routes)
router.use(authenticate)

// Users
router.get('/users', requireRole('system_admin'), listUsers)
router.delete('/users/:id', requireRole('system_admin'), sanitiseBody, deleteUser)

// Companies
router.get('/companies', requireRole('system_admin', 'underwriter'), listCompaniesAdmin)
router.patch('/companies/:id/verify', requireRole('system_admin'), sanitiseBody, verifyCompany)

// Loan Types — public GET, admin-only mutations
router.get('/loan-types', listLoanTypes)
router.post('/loan-types', requireRole('system_admin'), sanitiseBody, createLoanType)
router.patch('/loan-types/:id', requireRole('system_admin'), sanitiseBody, updateLoanType)

// Restoration requests
router.post('/restoration-requests', sanitiseBody, createRestorationRequest) // any user
router.get('/restoration-requests', requireRole('system_admin'), listRestorationRequests)
router.post('/restoration-requests/:id/approve', requireRole('system_admin'), sanitiseBody, approveRestoration)
router.post('/restoration-requests/:id/reject', requireRole('system_admin'), sanitiseBody, rejectRestoration)

// Audit logs
router.get('/audit-logs', requireRole('system_admin'), listAuditLogs)

export default router