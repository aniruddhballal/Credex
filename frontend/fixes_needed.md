# Credex — Frontend Fixes Needed

**Prepared by:** Cross-reference of backend and frontend READMEs  
**Date:** April 2026  
**Priority:** Apply alongside backend fixes — coordinate timing with backend team

This document covers what the frontend needs to fix independently of backend changes.
Some fixes here are complementary to backend fixes — noted where coordination is needed.

---

## 🔴 Critical — These break features entirely

---

### FIX 1 — `reset-password` sends wrong field name

**The problem:**
`/reset-password` page sends:
```json
{ "token": "...", "newPassword": "..." }
```

Backend expects:
```json
{ "token": "...", "password": "..." }
```

**Fix in `app/(auth)/reset-password/page.tsx`:**
Change the payload field name from `newPassword` to `password`:
```typescript
// Before
await api.post('/api/auth/reset-password', { token, newPassword: password })

// After
await api.post('/api/auth/reset-password', { token, password })
```

---

### FIX 2 — `POST /api/products` sent as multipart but backend expects JSON

**The problem:**
`ListingForm.tsx` sends product creation as `multipart/form-data` (because images
are embedded in the same request). Backend's `POST /api/products` expects JSON —
images are handled separately through `POST /api/images/product/:productId`.

**Fix in `components/supplier/ListingForm.tsx`:**
Split the submission into two sequential calls:

```typescript
// Step 1: Create product with JSON body (no images)
const { data: product } = await api.post('/api/products', {
  name, category, basePrice, priceUnit, description,
  tags, isNegotiable, isAvailable, stockQuantity,
  acceptedFinancingMethods, defaultPenaltyRate, defaultPaymentDeadlineDays
})

// Step 2: Upload each image separately if any were selected
for (const imageFile of selectedImages) {
  const formData = new FormData()
  formData.append('image', imageFile)
  await api.post(`/api/images/product/${product.data.id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}
```

For edit mode — same pattern: PATCH product first (JSON), then POST images if new ones added.

---

### FIX 3 — Profile picture upload uses wrong endpoint

**The problem:**
`components/shared/ProfilePage.tsx` sends avatar upload to:
```
PATCH /api/users/profile   (multipart)
```

Backend handles profile picture upload at:
```
PATCH /api/images/profile   (multipart, field: 'image')
```

`PATCH /api/users/profile` only accepts JSON body `{ firstName, lastName, phone }` —
it does not handle file uploads.

**Fix in `components/shared/ProfilePage.tsx`:**
```typescript
// Before (wrong)
const formData = new FormData()
formData.append('avatar', file)
await api.patch('/api/users/profile', formData)

// After (correct)
const formData = new FormData()
formData.append('image', file)          // field name must be 'image'
await api.patch('/api/images/profile', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
})
```

---

### FIX 4 — Loan type ID sent as a string slug, not an ObjectId

**The problem:**
The loan apply form sends:
```json
{ "loanTypeId": "working_capital" }
```

Backend's LoanType model uses MongoDB ObjectIds as `_id`. The `loanTypeId` field
in LoanApplication is an ObjectId reference, not a string code.

**Fix in `app/(buyer)/buyer/loans/apply/page.tsx`:**

Step 1 of the loan apply wizard must first fetch available loan types:
```typescript
// Add this call to load loan types for the selector
const { data } = await api.get('/api/admin/loan-types')  // public endpoint, no auth needed
// Render them as a radio/select — user picks one
// Send the selected loan type's _id (ObjectId string), not a slug
```

Then send the actual `_id` from the fetched LoanType:
```json
{ "loanTypeId": "64f8a1b2c3d4e5f6a7b8c9d0" }   // actual MongoDB ObjectId
```

---

### FIX 5 — Underwriter applications list calls wrong endpoint

**The problem:**
`/underwriter/applications` page calls:
```
GET /api/underwriter/queue?status=&cursor=&limit=20
```

This endpoint does not exist yet in the backend (backend team is adding it via FIX 1
in their document). However, until the backend deploys that fix, this page fails.

**Temporary fix while waiting for backend (add fallback):**
```typescript
// In the applications page, try underwriter endpoint first, fall back to loans
try {
  const { data } = await api.get('/api/underwriter/queue', { params })
  setApplications(data.data.items)
} catch (e) {
  // fallback until backend adds the new route
  const { data } = await api.get('/api/loans', { params })
  setApplications(data.data.items)
}
```

Remove the fallback once backend confirms `/api/underwriter/queue` is live.

---

## 🟠 Important — These cause visible failures

---

### FIX 6 — Dashboard pages will fail until backend builds aggregate endpoints

**Context:** Backend team is building `GET /api/buyer/dashboard`, `GET /api/supplier/dashboard`,
`GET /api/underwriter/dashboard` as part of their fixes. Until those are live, these pages crash.

**Interim fix — add loading/fallback states in dashboard pages:**

In `app/(buyer)/buyer/dashboard/page.tsx`:
```typescript
const { data, error } = useFetch('/api/buyer/dashboard')

if (error) {
  // Show a graceful degraded dashboard using individual API calls as fallback
  // Instead of crashing, show partial data
  return <DashboardFallback />
}
```

Create a `DashboardFallback` component that makes individual calls:
```typescript
// Fallback: parallel calls instead of single aggregate
const [pos, creditScore] = await Promise.all([
  api.get('/api/purchase-orders?role=buyer&paymentStatus=unpaid&limit=5'),
  api.get('/api/credit-scores/me')
])
```

This means dashboards will work (degraded — no optimizer alerts, slower) while
waiting for the backend aggregate endpoint.

---

### FIX 7 — `api-hooks/index.ts` needs `loanTypesApi` added

**The problem:**
The loan apply page needs to fetch available loan types from:
```
GET /api/admin/loan-types    (public endpoint, no auth)
```

This call is not in `api-hooks/index.ts`. It's being called inline or not at all,
meaning loan type names won't display in the wizard.

**Fix — add to `lib/api-hooks/index.ts`:**
```typescript
export const loanTypesApi = {
  getAll: () => api.get('/api/admin/loan-types'),
}
```

Use in `app/(buyer)/buyer/loans/apply/page.tsx`:
```typescript
const { data: loanTypes } = useFetch('/api/admin/loan-types')
// Render loanTypes.data as radio options
// On select, store the loanType._id (not a slug)
```

---

### FIX 8 — `api-hooks/index.ts` is missing `poApi.create`

**The problem:**
When a buyer accepts an RFQ, the flow should be:
1. `POST /api/rfqs/:id/accept` → RFQ status becomes `accepted`
2. `POST /api/purchase-orders` with `{ rfqId }` → creates the PO

Step 2 is missing from `poApi` in `api-hooks/index.ts`.

**Fix — add to `lib/api-hooks/index.ts`:**
```typescript
export const poApi = {
  // ... existing methods ...
  create: (rfqId: string) => api.post('/api/purchase-orders', { rfqId }),
}
```

**Then wire in the RFQ negotiation page** (`app/(buyer)/buyer/rfqs/[id]/page.tsx`):
```typescript
const handleAccept = async () => {
  await rfqApi.accept(rfqId)
  const { data } = await poApi.create(rfqId)          // create PO from accepted RFQ
  router.push(`/buyer/purchase-orders/${data.data.id}`) // redirect to new PO
}
```

Currently the accept button redirects to `/buyer/purchase-orders` (the list) without
creating the PO — meaning the PO never gets created.

---

### FIX 9 — Signed document URL is not refreshed before iframe loads

**The problem:**
`/underwriter/applications/[id]` fetches a signed URL and shows it in an iframe.
Signed URLs expire in 15 minutes. If the underwriter spends time reviewing and then
clicks "View" on a document for the second time, the URL may have expired, causing
the iframe to show an error.

**Fix in the document viewer logic:**
Never cache signed URLs in state. Always fetch fresh:
```typescript
const handleViewDocument = async (documentId: string) => {
  setLoadingDocId(documentId)
  try {
    // Always call this fresh — never reuse a stored URL
    const { data } = await api.get(`/api/underwriter/documents/${documentId}/view`)
    setViewingUrl(data.url)    // open in modal iframe
    setViewingDocId(documentId)
  } finally {
    setLoadingDocId(null)
  }
}

// When modal closes, clear the URL
const handleCloseViewer = () => {
  setViewingUrl(null)          // discard — do not store
  setViewingDocId(null)
}
```

---

### FIX 10 — PO creation is never triggered after RFQ accept on supplier side

**The problem:**
`/supplier/rfqs/[id]` accept button calls `POST /api/rfqs/:id/accept` then redirects
to `/supplier/purchase-orders`. But per business rules, the **buyer** creates the PO
from the accepted RFQ (not the supplier). So the supplier should not redirect to POs —
they should redirect back to their RFQ list with a message saying "RFQ accepted —
waiting for buyer to confirm the order."

**Fix in `app/(supplier)/supplier/rfqs/[id]/page.tsx`:**
```typescript
const handleAccept = async () => {
  await rfqApi.accept(rfqId)
  // Do NOT try to create a PO here — buyer does that
  toast.success('RFQ accepted — buyer will be notified to confirm the order')
  router.push('/supplier/rfqs')   // back to list, not purchase orders
}
```

Also send a notification to the buyer (this is handled by the backend automatically —
no frontend change needed there).

---

## 🟡 Minor — Polish and small correctness issues

---

### FIX 11 — `types/index.ts` is missing several types

The following types are used in pages but may not be defined in `types/index.ts`:

- `LoanType` — needed for the loan apply wizard
- `Review` — needed for PO detail review display
- `ChatMessage` — needed if chat panel is ever wired up
- `DocumentAccessLog` — not needed in frontend, can skip
- `AuditLog` — not needed in frontend, can skip
- `RestorationRequest` — not needed in frontend, can skip

**Fix — add to `types/index.ts`:**
```typescript
export interface LoanType {
  _id: string
  name: string
  code: string
  description?: string
  minAmount: number        // paise
  maxAmount: number        // paise
  minTenureMonths: number
  maxTenureMonths: number
  baseInterestRate: number // % p.a.
  isActive: boolean
}

export interface Review {
  _id: string
  purchaseOrderId: string
  reviewType: 'buyer_to_supplier' | 'supplier_to_buyer' | 'buyer_to_product'
  reviewedByCompanyId: string
  targetCompanyId?: string
  targetProductId?: string
  rating: number           // 1–5
  comment?: string
  createdAt: string
}

export interface ChatMessage {
  _id: string
  rfqId?: string
  purchaseOrderId?: string
  senderId: string
  senderCompanyId: string
  message: string
  isRead: boolean
  createdAt: string
}
```

---

### FIX 12 — `formatDeadline` is used in PO list but urgency thresholds need to match backend alerts

Backend optimizer alerts flag POs where `paymentDeadline <= now + 7 days`.
Frontend's `formatDeadline` function should use the same threshold for the danger colour:

```typescript
// In lib/format.ts
export const formatDeadline = (date: string | Date) => {
  const d = new Date(date)
  const now = new Date()
  const daysLeft = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (daysLeft < 0)  return { label: `${Math.abs(daysLeft)}d overdue`, urgency: 'high' as const }
  if (daysLeft <= 3) return { label: `${daysLeft}d left`, urgency: 'high' as const }
  if (daysLeft <= 7) return { label: `${daysLeft}d left`, urgency: 'medium' as const }
  return { label: `${daysLeft}d left`, urgency: 'low' as const }
}
```

Verify this matches what's currently in `format.ts` — particularly the 3-day and 7-day thresholds.

---

### FIX 13 — `middleware.ts` should handle `system_admin` role redirect

Login page redirects `system_admin` to `/admin/dashboard`. But `middleware.ts` likely
only knows about `/buyer/*`, `/supplier/*`, `/underwriter/*` route groups.

**Fix in `middleware.ts`:**
```typescript
const roleRouteMap = {
  buyer: '/buyer',
  supplier: '/supplier',
  underwriter: '/underwriter',
  system_admin: '/admin'        // add this
}

// If role is system_admin and path doesn't start with /admin → redirect to /admin/dashboard
// Note: /admin/* does not exist in this Next.js app (admin is a separate deployment)
// So if a system_admin somehow lands here, redirect them away
if (role === 'system_admin') {
  return NextResponse.redirect(new URL('https://admin.credex.in', req.url))
}
```

---

## Coordination Notes

These fixes require timing coordination with the backend team:

| Frontend Fix | Wait for Backend Fix | Notes |
|---|---|---|
| FIX 5 (underwriter fallback) | Backend FIX 1 (underwriter namespace) | Remove fallback once backend is live |
| FIX 6 (dashboard fallback) | Backend FIX 2 (dashboard endpoints) | Remove fallback once backend is live |
| FIX 12 (response wrapper) | Backend FIX 12 (response wrapper) | Must deploy together — both sides change at once |

**The response wrapper (FIX 12 backend / data wrapper) is the most important coordinated change.**
Once the backend adds `{ success: true, data: {...} }` wrapping, the frontend's
`api-hooks/index.ts` needs to unwrap it. Check each hook:

```typescript
// Before backend adds wrapper — hooks return raw response
const getProducts = () => api.get('/api/products').then(r => r.data)

// After backend adds wrapper — unwrap .data.data
const getProducts = () => api.get('/api/products').then(r => r.data.data)
```

If `api.ts` already has a response interceptor that unwraps `.data.data` automatically,
no individual hook changes are needed. Verify this in `lib/api.ts` before making individual changes.

---

*Document version: 1.0*  
*Cross-referenced against: credexBackendReadme.md + credexFrontendReadme.md*  
*Coordinate timing with backend team on shared fixes listed above*