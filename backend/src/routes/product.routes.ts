import { Router } from 'express'
import {
  createProduct,
  getProductById,
  listProducts,
  getMyProducts,
  updateProduct,
  deleteProduct,
} from '../controllers/product.controller'
import { authenticate } from '../middleware/auth'
import { sanitiseBody } from '../middleware/sanitise'

const router = Router()

// Public
router.get('/', listProducts)
router.get('/:id', getProductById)

// Authenticated (supplier only — enforced in controller)
router.use(authenticate)
router.get('/my/listings', getMyProducts)
router.post('/', sanitiseBody, createProduct)
router.patch('/:id', sanitiseBody, updateProduct)
router.delete('/:id', deleteProduct)

export default router