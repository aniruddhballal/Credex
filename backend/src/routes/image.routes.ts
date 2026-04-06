import { Router } from 'express'
import {
  imageUpload,
  uploadProfilePicture,
  uploadCompanyLogo,
  uploadProductImage,
  deleteProductImage,
} from '../controllers/image.controller'
import { authenticate } from '../middleware/auth'

const router = Router()

router.use(authenticate)

router.patch('/profile', imageUpload.single('image'), uploadProfilePicture)
router.patch('/company-logo', imageUpload.single('image'), uploadCompanyLogo)
router.post('/product/:productId', imageUpload.single('image'), uploadProductImage)
router.delete('/product/:productId', deleteProductImage)

export default router