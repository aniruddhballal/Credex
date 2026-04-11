import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth'
import { getBuyerDashboard, getSupplierDashboard } from '../controllers/dashboard.controller'

export const buyerRouter = Router()
export const supplierRouter = Router()

// GET /api/buyer/dashboard
buyerRouter.get('/dashboard', authenticate, requireRole('buyer', 'system_admin'), getBuyerDashboard)

// GET /api/supplier/dashboard
supplierRouter.get('/dashboard', authenticate, requireRole('supplier', 'system_admin'), getSupplierDashboard)