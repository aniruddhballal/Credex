import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import cookieParser from 'cookie-parser'
import authRoutes from './routes/auth.routes'
import userRoutes from './routes/user.routes'
import companyRoutes from './routes/company.routes'
import productRoutes from './routes/product.routes'
import rfqRoutes from './routes/rfq.routes'
import purchaseOrderRoutes from './routes/purchaseOrder.routes'
import loanRoutes from './routes/loan.routes'
import notificationRoutes from './routes/notification.routes'
import reviewRoutes from './routes/review.routes'
import chatRoutes from './routes/chat.routes'
import documentRoutes from './routes/document.routes'
import imageRoutes from './routes/image.routes'
import creditScoreRoutes from './routes/creditScore.routes'
import adminRoutes from './routes/admin.routes'
import { ipWhitelistMiddleware } from './middleware/ipWhitelist'

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())

// Public + authenticated routes
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/companies', companyRoutes)
app.use('/api/products', productRoutes)
app.use('/api/rfqs', rfqRoutes)
app.use('/api/purchase-orders', purchaseOrderRoutes)
app.use('/api/loans', loanRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/reviews', reviewRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/documents', documentRoutes)
app.use('/api/images', imageRoutes)
app.use('/api/credit-scores', creditScoreRoutes)

// Admin routes — IP-whitelisted at middleware level before any handler runs
app.use('/api/admin', ipWhitelistMiddleware, adminRoutes)

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI!)
  .then(() => {
    console.log('✅ MongoDB connected')
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`))
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err)
    process.exit(1)
  })

export default app