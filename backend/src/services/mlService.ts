/**
 * services/mlService.ts
 *
 * Node backend proxy to the Python FastAPI ML service.
 * All ML/optimizer calls go through this service — never called directly
 * from the frontend.
 *
 * Environment variables required:
 *   ML_SERVICE_URL=http://localhost:8000   (or Render URL in production)
 *   ML_SERVICE_TIMEOUT_MS=10000
 */

import axios, { AxiosInstance } from 'axios'

// ---------------------------------------------------------------------------
// Types — mirror the Python Pydantic models
// ---------------------------------------------------------------------------

export interface DailyInflow {
  date: string   // ISO date string e.g. "2026-04-10"
  amount: number // paise
}

export interface Payable {
  purchaseOrderId: string
  supplierName: string
  amountRemaining: number  // paise
  deadline: string         // ISO date string
  penaltyRatePerDay: number // % per day
}

export interface OptimizeRequest {
  currentCash: number
  dailyInflows: DailyInflow[]
  payables: Payable[]
}

export interface ScheduledPayment {
  date: string
  purchaseOrderId: string
  supplierName: string
  amountToPay: number
  reason: string
}

export interface Alert {
  purchaseOrderId: string
  urgency: 'high' | 'medium' | 'low'
  message: string
}

export interface ProjectedBalance {
  date: string
  balance: number
}

export interface OptimizeResponse {
  paymentSchedule: ScheduledPayment[]
  alerts: Alert[]
  projectedCashBalance: ProjectedBalance[]
}

export interface CreditRiskRequest {
  companyAgeYears: number
  annualRevenuePaise: number
  existingLoanCount: number
  existingLoanTotalPaise: number
  totalPOsCompleted: number
  onTimePaymentRate: number
  averageReviewScore: number
  disputeRate: number
  requestedAmountPaise: number
  loanTenureMonths: number
  purposeCategory: string
  isGSTVerified: boolean
  isPANVerified: boolean
  isUdyamRegistered: boolean
}

export interface CreditRiskResponse {
  riskScore: number
  riskTier: 'low' | 'medium' | 'high' | 'very_high'
  confidence: number
  flags: string[]
  modelUsed: 'xgboost' | 'heuristic'
}

export interface CreditScoreRequest {
  companyId: string
  totalPOsCompleted: number
  onTimePaymentRate: number
  averageReviewScore: number
  disputeRate: number
  loanRepaymentRate: number
  isVerified: boolean
  daysSinceFirstTransaction: number
}

export interface CreditScoreBreakdown {
  base: number
  paymentComponent: number
  volumeComponent: number
  reviewComponent: number
  disputePenalty: number
  loanComponent: number
  verificationBonus: number
  tenureBonus: number
  total: number
}

export interface CreditScoreResponse {
  companyId: string
  score: number
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
  breakdown: CreditScoreBreakdown
  improvementTips: string[]
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const createMLClient = (): AxiosInstance => {
  const baseURL = process.env.ML_SERVICE_URL || 'http://localhost:8000'
  const timeout = parseInt(process.env.ML_SERVICE_TIMEOUT_MS || '10000', 10)

  return axios.create({
    baseURL,
    timeout,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Singleton — one client per Node process lifetime
const mlClient = createMLClient()

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export const checkMLHealth = async (): Promise<boolean> => {
  try {
    const res = await mlClient.get('/health')
    return res.data?.status === 'ok'
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Optimize — cash flow optimizer
// ---------------------------------------------------------------------------

export const runOptimizer = async (
  payload: OptimizeRequest
): Promise<OptimizeResponse> => {
  try {
    const res = await mlClient.post<OptimizeResponse>('/optimize', payload)
    return res.data
  } catch (err: any) {
    const message = err?.response?.data?.detail || err?.message || 'ML service unavailable'
    throw new Error(`Optimizer error: ${message}`)
  }
}

// ---------------------------------------------------------------------------
// Credit Risk — called at loan submission time
// ---------------------------------------------------------------------------

export const predictCreditRisk = async (
  payload: CreditRiskRequest
): Promise<CreditRiskResponse> => {
  try {
    const res = await mlClient.post<CreditRiskResponse>('/credit-risk', payload)
    return res.data
  } catch (err: any) {
    const message = err?.response?.data?.detail || err?.message || 'ML service unavailable'
    throw new Error(`Credit risk error: ${message}`)
  }
}

// ---------------------------------------------------------------------------
// Credit Score — called by daily cron job
// ---------------------------------------------------------------------------

export const computeCreditScore = async (
  payload: CreditScoreRequest
): Promise<CreditScoreResponse> => {
  try {
    const res = await mlClient.post<CreditScoreResponse>('/credit-score', payload)
    return res.data
  } catch (err: any) {
    const message = err?.response?.data?.detail || err?.message || 'ML service unavailable'
    throw new Error(`Credit score error: ${message}`)
  }
}