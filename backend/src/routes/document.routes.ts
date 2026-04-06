import { Router } from 'express'
import {
  upload,
  uploadDocumentHandler,
  getDocumentUrl,
  listDocuments,
  acceptDocument,
  rejectDocument,
  deleteDocumentHandler,
} from '../controllers/document.controller'
import { authenticate, requireRole } from '../middleware/auth'

const router = Router()

router.use(authenticate)

router.get('/', listDocuments)
router.post('/', upload.single('document'), uploadDocumentHandler)
router.get('/:id/url', getDocumentUrl)
router.patch('/:id/accept', requireRole('underwriter', 'system_admin'), acceptDocument)
router.patch('/:id/reject', requireRole('underwriter', 'system_admin'), rejectDocument)
router.delete('/:id', deleteDocumentHandler)

export default router