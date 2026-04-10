# Credex — Build Roadmap

## Context

This is not a greenfield project. Three working products already exist:
- **VenPay** — marketplace, product listings, payment tracking, reviews
- **LOANlo** — loan origination, document vault, underwriter workflow, admin panel,
  session management, email system, credit risk ML microservice
- **VenPayRL** — multi-agent cash flow simulation (rule, heuristic, Q-table, DQN)

The task is **Option A: migrate and merge** — rebuild as one unified platform (Credex)
with a shared codebase, shared database, and shared intelligence layer.
The three old deployments remain live independently.

---

## Guiding Principles For This Build

1. **Don't rebuild what already works well** — carry logic forward, don't rewrite for the sake of it
2. **Tailwind throughout** — VenPay's MUI is the only outlier; Credex standardises on Tailwind
3. **One database, one schema** — the credit score and optimizer only work with unified data
4. **Python microservice for intelligence** — keep Node for API/business logic,
   Python for ML/optimization (already established in LOANlo's credit-risk-ml service)
5. **LOANlo's backend is the most mature** — its auth, session management, audit logging,
   email system, and admin architecture should be the foundation Credex builds on

---

## Phase 0 — Schema Design & Project Setup ✅ COMPLETE

- [x] Design full schema for all 17 collections
- [x] Define relationships, soft delete strategy, indexes
- [x] MongoDB Atlas cluster set up for Credex
- [x] GitHub repository set up
- [x] Project structure created:
  - `/backend` — Node + Express + TypeScript
  - `/frontend` — Next.js (not started yet)
  - `/ml-service` — Python + FastAPI (not started yet)

---

## Phase 1 — Backend Foundation ✅ COMPLETE

**Completed batch by batch:**

### Auth & Users ✅
- [x] User model (`models/User.ts`)
- [x] Session model (`models/Session.ts`)
- [x] AuditLog model (`models/AuditLog.ts`)
- [x] JWT utilities (`utils/jwt.ts`)
- [x] Email utilities (`utils/email.ts`) — Gmail OAuth2
- [x] Auth middleware (`middleware/auth.ts`) — JWT verify + session check + inactivity timeout
- [x] Sanitise middleware (`middleware/sanitise.ts`) — xss library
- [x] IP whitelist middleware (`middleware/ipWhitelist.ts`)
- [x] Auth controller (`controllers/auth.controller.ts`)
- [x] Auth routes (`routes/auth.routes.ts`)
- [x] server.ts wired up
- [x] .env.example created

**Auth endpoints live:**
```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
GET  /api/auth/verify-email?token=...
POST /api/auth/forgot-password
POST /api/auth/reset-password
POST /api/auth/logout
GET  /api/auth/me
```

### Company & User Profiles ✅
- [x] Company model (`models/Company.ts`)
- [x] User controller (`controllers/user.controller.ts`)
- [x] Company controller (`controllers/company.controller.ts`)
- [x] User routes (`routes/user.routes.ts`)
- [x] Company routes (`routes/company.routes.ts`)

**Profile endpoints live:**
```
GET    /api/users/profile
PATCH  /api/users/profile
POST   /api/users/change-password

POST   /api/companies                  create + link to account
GET    /api/companies/me/profile
PATCH  /api/companies/me/profile
GET    /api/companies/:id              public profile
GET    /api/companies                  paginated listing (?type=supplier&city=Mumbai&search=steel)
```

### Products & Listings ✅
- [x] Product model (`models/Product.ts`)
- [x] Product controller (`controllers/product.controller.ts`)
- [x] Product routes (`routes/product.routes.ts`)

**Product endpoints live:**
```
GET    /api/products                   public listing with filters + cursor pagination
GET    /api/products/:id               public product detail
GET    /api/products/my/listings       supplier's own products
POST   /api/products                   create (supplier only)
PATCH  /api/products/:id               update (owner only)
DELETE /api/products/:id               soft delete (owner only)
```

### RFQ & Negotiation ✅
- [x] RFQ model (`models/RFQ.ts`)
- [x] Notification model (`models/Notification.ts`)
- [x] RFQ controller (`controllers/rfq.controller.ts`)
- [x] RFQ routes (`routes/rfq.routes.ts`)

**RFQ endpoints live:**
```
GET   /api/rfqs                        your RFQs (?role=buyer|supplier&status=pending)
GET   /api/rfqs/:id                    full detail with negotiation history
POST  /api/rfqs                        buyer creates RFQ
POST  /api/rfqs/:id/counter            counter with new terms
POST  /api/rfqs/:id/accept             accept current terms
POST  /api/rfqs/:id/decline            decline
```

### Purchase Orders & Payments ✅
- [x] PurchaseOrder model (`models/PurchaseOrder.ts`)
- [x] Payment model (`models/Payment.ts`)
- [x] PO controller (`controllers/purchaseOrder.controller.ts`)
- [x] Payment controller (`controllers/payment.controller.ts`)
- [x] PO routes (`routes/purchaseOrder.routes.ts`)

**PO + Payment endpoints live:**
```
GET   /api/purchase-orders             your POs (filtered)
GET   /api/purchase-orders/:id         full detail
POST  /api/purchase-orders             create from accepted RFQ { rfqId }
PATCH /api/purchase-orders/:id/fulfilment   supplier updates fulfilment
POST  /api/purchase-orders/:id/cancel

POST  /api/purchase-orders/:id/payments    buyer records payment
GET   /api/purchase-orders/:id/payments    payment history
```

### Still To Do In Phase 1
- [x] Review model + endpoints
- [x] Aggregate rating updates on Product + Company on review submission
- [x] Payment due reminder cron job (3 days before deadline)
- [x] RFQ expiry cron job
- [x] In-platform notifications endpoint
- [x] Chat model + endpoints
- [x] S3 image upload (Cloudinary for images, Backblaze B2 for documents)

---

## Phase 2 — Loan & Document Vault ✅ COMPLETE

- [x] LoanType model + admin CRUD
- [x] LoanApplication model + multi-step application endpoints
- [x] Document model (Backblaze B2 metadata)
- [x] B2 upload with signed expiring URLs
- [x] DocumentAccessLog model + write on every view
- [x] Underwriter dashboard endpoints (view queue, review, approve/reject/request docs)
- [x] Loan status state machine enforcement
- [x] Credit risk score call to Python service on loan submission
- [x] Loan email notifications
- [x] RestorationRequest model + endpoints

---

## Phase 3 — Python ML Microservice ✅ COMPLETE

- [x] FastAPI project setup
- [x] POST /optimize — PuLP LP solver, 90-day cash flow schedule
- [x] POST /credit-risk — XGBoost + heuristic fallback, underwriter flags
- [x] POST /credit-score — 300–900 score, tier, breakdown, improvement tips
- [x] Node mlService.ts proxy
- [x] optimizer.controller.ts
- [x] creditScoreCron.ts — daily recomputation job

---

## Phase 4 — Frontend (Next.js) ✅ COMPLETE

37 pages and components total:

**Auth (6):** login, register, forgot-password, reset-password, verify-email, auth layout

**Buyer (11):** dashboard, discover (search + filters), product detail + RFQ modal,
RFQ list, RFQ negotiation view, PO list, PO detail + payment recording + reviews,
cash flow optimizer + Recharts chart, loans list, loan apply (3-step),
loan detail + doc upload, notifications, profile

**Supplier (10):** dashboard, listings grid, create listing, edit listing,
RFQ list, RFQ negotiation, PO list, PO detail + fulfilment stepper,
notifications, profile

**Underwriter (3):** dashboard + queue stats, applications list,
application detail + doc viewer + approve/reject/request-docs

**UI components (9):** Button, Input/Textarea/Select, Card, Badge/StatusBadge,
Modal/ConfirmModal, Skeleton variants, Table, Pagination/EmptyState/ErrorState/Spinner, StatCard

**Infrastructure:** auth context, Axios with silent token refresh, typed API hooks
for every endpoint, useFetch/usePaginated/useDebounce/useDisclosure,
full TypeScript types, Next.js middleware route protection,
Indian currency/date formatters, Tailwind design tokens

---

## Phase 5 — Integration Testing & Hardening 🔄 NEXT

This is not optional before deployment. Do not skip.

### End-to-End Flow Tests (Manual first, automated later)

**Core marketplace flow:**
- [ ] Register as supplier → create company → list a product with image
- [ ] Register as buyer → create company → search + find product
- [ ] Buyer submits RFQ → supplier counters → buyer accepts → PO created
- [ ] Buyer records partial payment → PO status updates → supplier sees it
- [ ] Supplier marks fulfilment delivered → PO completes → reviews unlock
- [ ] Both parties submit reviews → aggregate ratings update on product + company

**Loan flow:**
- [ ] Buyer applies for loan on a confirmed PO → draft created
- [ ] Buyer submits draft → underwriter gets notification
- [ ] Underwriter assigns self → requests documents
- [ ] Buyer uploads docs → underwriter reviews → approves
- [ ] Credit risk score computed on submission
- [ ] Loan approval details visible on loan detail page

**Optimizer flow:**
- [ ] Buyer has 3+ active POs with different deadlines and penalty rates
- [ ] Buyer opens optimizer, enters cash balance + inflows
- [ ] Schedule returned, chart renders, alerts show correctly
- [ ] Schedule reflects actual PO data from DB (not mock)

**Admin flow:**
- [ ] Admin login from allowlisted IP with TOTP works
- [ ] Admin login from non-allowlisted IP is blocked
- [ ] Admin soft deletes a user → user cannot log in
- [ ] Admin restores user → user can log in again
- [ ] Audit log entry created for every admin action

### Security Checks (Non-negotiable before deployment)
- [ ] Try accessing `/api/admin/*` from a non-allowlisted IP → must get 403
- [ ] Try accessing `/api/buyer/*` with a supplier token → must get 403
- [ ] Try fetching a document's signed URL as a different user → must get 403
- [ ] Check that no API response ever contains `storageKey`, `storageBucket`, `password`,
      `verificationToken`, `resetPasswordToken` — grep the codebase for these
- [ ] Submit XSS payload in product name: `<script>alert(1)</script>` → must be sanitised
- [ ] Hit `/api/auth/login` 11 times in 1 minute from same IP → must get 429
- [ ] Expire an access token, try a protected route → must get 401
- [ ] Refresh with expired refresh token → must get 401

### Data Integrity Checks
- [ ] Make a partial payment → verify `amountPaid + amountRemaining === totalPrice` exactly
- [ ] Submit two reviews of the same type on the same PO → second must fail with 409
- [ ] Try to create a PO directly (not from accepted RFQ) → must be blocked
- [ ] Try to pay more than `amountRemaining` → must be blocked
- [ ] Soft delete a product → verify it no longer appears in public search results
- [ ] Verify Payment documents cannot be updated after creation (no PATCH /payments/:id)

### Performance Checks
- [ ] Product search with 0 results returns fast (no full collection scan)
- [ ] Run `explain()` on the product search query — verify indexes are hit
- [ ] Optimizer returns within 2 seconds for a buyer with 10 active POs
- [ ] Document signed URL generates within 500ms

### Missing Piece — Admin Frontend
The admin frontend (separate subdomain, IP-restricted, TOTP login) was not
built in Phase 4. This is needed before deployment for:
- User management (soft delete, restore)
- LoanType management
- Audit log viewer
- Company verification
- Session management

**Options:**
1. Build a minimal admin frontend now (1 week — basic tables, actions, no polish)
2. Use the existing `/api/admin/*` routes via a tool like Postman or Retool temporarily
3. Build it properly as a separate Next.js app after deployment

Recommendation: Option 2 for now (Retool is free, connects to your API in minutes),
build Option 3 properly post-launch when you have real admin needs.

---

## Phase 6 — Deployment ⏳ NOT STARTED
**Time estimate: 1 week**

- [ ] Frontend: Vercel (Next.js)
- [ ] Backend (Node): Render or Railway
- [ ] ML Service (Python/FastAPI): Render (separate service)
- [ ] Database: MongoDB Atlas (new Credex cluster)
- [ ] File storage: AWS S3 + KMS
- [ ] Environment variables: all secrets in .env, never committed
- [ ] Admin subdomain: admin.credex.in (or equivalent), IP-restricted at CDN/infra level
- [ ] Domain setup, SSL
- [ ] Monitoring: basic uptime monitoring (Better Uptime or similar)
- [ ] Error tracking: Sentry (frontend + backend)

---

## Timeline (Revised)

| Phase | What | Status | Estimate Remaining |
|---|---|---|---|
| 0 | Schema + setup | ✅ Done | — |
| 1 | Backend foundation | ✅ Done | — |
| 2 | Loan marketplace + document vault | ✅ Done | — |
| 3 | Python ML microservice | ✅ Done | — |
| 4 | Next.js frontend | ✅ Done | — |
| 5 | Testing + hardening | 🔄 Next | 1–2 weeks |
| 6 | Deployment | ⏳ | 1 week |
| **Total remaining** | | | **~2–3 weeks** |

---

## What To Do Next

**Phases 0–4 are complete. The platform is fully built.**

Phase 5 is next — work through the testing checklist above top to bottom.
Start with the core marketplace flow (register → RFQ → PO → payment → review)
before touching security or performance checks.

**One gap to note:** the Admin frontend was not built in Phase 4.
Recommendation: use Retool (free, connects to your API in minutes) as a temporary
admin interface while you finish testing and deployment. Build a proper admin
frontend as a separate Next.js app post-launch.

Phase 6 (deployment) starts after Phase 5 checklist is mostly green.

---

*Maintained by: Aniruddh Ballal*
*Last updated: April 2026*