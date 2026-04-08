/**
 * lib/api-hooks/index.ts
 * Typed wrappers around every backend API endpoint.
 * Import these in pages — never call `api` directly from page components.
 */

import api from '@/lib/api'
import type {
  Product, Company, RFQ, PurchaseOrder, Payment,
  LoanApplication, CreditScore, Notification, OptimizerResult,
  PaginatedResponse,
} from '@/types'

// ── Products ──────────────────────────────────────────────────────────────────

export interface ProductFilters {
  search?: string
  category?: string
  city?: string
  minPrice?: number
  maxPrice?: number
  minRating?: number
  financingMethod?: string
  cursor?: string
  limit?: number
}

export const productsApi = {
  list: (filters: ProductFilters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => v !== undefined && params.set(k, String(v)))
    return api.get<{ data: PaginatedResponse<Product> }>(`/api/products?${params}`)
  },
  get: (id: string) => api.get<{ data: Product }>(`/api/products/${id}`),
  myListings: () => api.get<{ data: PaginatedResponse<Product> }>('/api/products/my/listings'),
  create: (data: FormData) => api.post<{ data: Product }>('/api/products', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  update: (id: string, data: Partial<Product>) => api.patch<{ data: Product }>(`/api/products/${id}`, data),
  delete: (id: string) => api.delete(`/api/products/${id}`),
}

// ── Companies ─────────────────────────────────────────────────────────────────

export const companiesApi = {
  getMe: () => api.get<{ data: Company }>('/api/companies/me/profile'),
  updateMe: (data: Partial<Company>) => api.patch<{ data: Company }>('/api/companies/me/profile', data),
  get: (id: string) => api.get<{ data: Company }>(`/api/companies/${id}`),
  list: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params)
    return api.get<{ data: PaginatedResponse<Company> }>(`/api/companies?${qs}`)
  },
  create: (data: Partial<Company>) => api.post<{ data: Company }>('/api/companies', data),
}

// ── RFQs ──────────────────────────────────────────────────────────────────────

export interface CreateRFQPayload {
  productId: string
  supplierId: string
  proposedPrice: number
  proposedQuantity: number
  proposedFinancingMethod: string
  proposedPaymentDeadlineDays: number
  proposedPenaltyRate: number
  message?: string
}

export const rfqApi = {
  list: (role: 'buyer' | 'supplier', status?: string) => {
    const params = new URLSearchParams({ role })
    if (status) params.set('status', status)
    return api.get<{ data: PaginatedResponse<RFQ> }>(`/api/rfqs?${params}`)
  },
  get: (id: string) => api.get<{ data: RFQ }>(`/api/rfqs/${id}`),
  create: (data: CreateRFQPayload) => api.post<{ data: RFQ }>('/api/rfqs', data),
  counter: (id: string, data: Partial<CreateRFQPayload>) =>
    api.post<{ data: RFQ }>(`/api/rfqs/${id}/counter`, data),
  accept: (id: string) => api.post<{ data: RFQ }>(`/api/rfqs/${id}/accept`),
  decline: (id: string) => api.post<{ data: RFQ }>(`/api/rfqs/${id}/decline`),
}

// ── Purchase Orders ───────────────────────────────────────────────────────────

export const poApi = {
  list: (filters: Record<string, string> = {}) => {
    const params = new URLSearchParams(filters)
    return api.get<{ data: PaginatedResponse<PurchaseOrder> }>(`/api/purchase-orders?${params}`)
  },
  get: (id: string) => api.get<{ data: PurchaseOrder }>(`/api/purchase-orders/${id}`),
  updateFulfilment: (id: string, status: string) =>
    api.patch(`/api/purchase-orders/${id}/fulfilment`, { fulfilmentStatus: status }),
  cancel: (id: string) => api.post(`/api/purchase-orders/${id}/cancel`),
  recordPayment: (id: string, data: { amount: number; method: string; reference?: string }) =>
    api.post<{ data: Payment }>(`/api/purchase-orders/${id}/payments`, data),
  getPayments: (id: string) =>
    api.get<{ data: Payment[] }>(`/api/purchase-orders/${id}/payments`),
}

// ── Loans ─────────────────────────────────────────────────────────────────────

export const loansApi = {
  list: () => api.get<{ data: PaginatedResponse<LoanApplication> }>('/api/loans'),
  get: (id: string) => api.get<{ data: LoanApplication }>(`/api/loans/${id}`),
  create: (data: {
    purchaseOrderId: string
    loanTypeId: string
    requestedAmount: number
    tenureMonths: number
    purpose: string
  }) => api.post<{ data: LoanApplication }>('/api/loans', data),
  submit: (id: string) => api.post(`/api/loans/${id}/submit`),
  uploadDocument: (id: string, formData: FormData) =>
    api.post(`/api/loans/${id}/documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
}

// ── Optimizer ─────────────────────────────────────────────────────────────────

export const optimizerApi = {
  run: (currentCash: number, dailyInflows: { date: string; amount: number }[]) =>
    api.post<{ data: OptimizerResult }>('/api/optimizer/schedule', { currentCash, dailyInflows }),
}

// ── Credit Score ──────────────────────────────────────────────────────────────

export const creditScoreApi = {
  getMe: () => api.get<{ data: CreditScore }>('/api/credit-scores/me'),
  getHistory: () => api.get<{ data: CreditScore[] }>('/api/credit-scores/me/history'),
}

// ── Notifications ─────────────────────────────────────────────────────────────

export const notificationsApi = {
  list: () => api.get<{ data: PaginatedResponse<Notification> }>('/api/notifications'),
  markRead: (id: string) => api.patch(`/api/notifications/${id}/read`),
  markAllRead: () => api.patch('/api/notifications/read-all'),
}

// ── Reviews ───────────────────────────────────────────────────────────────────

export const reviewsApi = {
  submit: (data: {
    purchaseOrderId: string
    reviewType: 'buyer_to_supplier' | 'supplier_to_buyer' | 'buyer_to_product'
    rating: number
    comment?: string
  }) => api.post('/api/reviews', data),
  list: (companyId: string) =>
    api.get(`/api/reviews?companyId=${companyId}`),
}

// ── Underwriter ───────────────────────────────────────────────────────────────

export const underwriterApi = {
  queue: () => api.get<{ data: PaginatedResponse<LoanApplication> }>('/api/underwriter/queue'),
  get: (id: string) => api.get<{ data: LoanApplication }>(`/api/underwriter/applications/${id}`),
  requestDocs: (id: string, note: string) =>
    api.post(`/api/underwriter/applications/${id}/request-docs`, { note }),
  approve: (id: string, data: { approvedAmount: number; interestRate: number; note?: string }) =>
    api.post(`/api/underwriter/applications/${id}/approve`, data),
  reject: (id: string, reason: string) =>
    api.post(`/api/underwriter/applications/${id}/reject`, { reason }),
  getDocumentUrl: (documentId: string) =>
    api.get<{ data: { url: string } }>(`/api/underwriter/documents/${documentId}/view`),
}