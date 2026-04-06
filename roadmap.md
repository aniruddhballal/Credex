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

## Phase 1 — Backend Foundation 🔄 IN PROGRESS

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
- [ ] Review model + endpoints (unlocks after PO completes)
- [ ] Aggregate rating updates on Product + Company on review submission
- [ ] Payment due reminder cron job (3 days before deadline)
- [ ] RFQ expiry cron job (mark expired RFQs daily)
- [ ] In-platform notifications endpoint (GET /api/notifications, PATCH read)
- [ ] Chat model + endpoints (linked to RFQ or PO)
- [ ] S3 image upload for products and company logos (currently missing)

---

## Phase 2 — Loan & Document Vault (carry from LOANlo)
**Time estimate: 2–3 weeks**
**Most of this logic already exists — port and adapt**

### Loan Applications
- [ ] Loan application model (linked to PO + buyer company)
- [ ] Multi-step application form endpoints
- [ ] Loan types: working capital, LAP, invoice discounting, others
- [ ] Loan status state machine (carry from LOANlo):
  pending → under_review → approved / rejected / request_documents → pending
- [ ] Underwriter actions: approve, reject, request additional documents

### Document Vault (upgrade from LOANlo)
- [ ] Migrate from LOANlo's storage to AWS S3 + KMS
- [ ] Signed expiring URLs only (no public S3 links)
- [ ] Document type tagging (GST, PAN, incorporation cert, ITR, bank statements, etc.)
- [ ] document_access_logs — every view recorded (carry from LOANlo)
- [ ] Conflict resolution: handle concurrent document actions by applicant + underwriter

### Email Notifications for Loans
- [ ] Application submitted, under review, approved, rejected,
      documents requested, documents uploaded, restoration (carry from LOANlo)

---

## Phase 3 — Python ML Microservice
**Time estimate: 2–3 weeks**
**Port VenPayRL engine to Python; integrate LOANlo's credit risk model**

### Cash Flow Optimiser
- [ ] FastAPI service setup
- [ ] Port simulation engine from VenPayRL TypeScript → Python
- [ ] Port agent logic:
  - Rule-based agent
  - Heuristic agent
  - Q-table agent (with persistent weights — serialize to disk/DB)
  - DQN agent (move off main thread — use Python multiprocessing or background worker)
- [ ] New endpoint: POST /optimize
  - Input: buyer's current cash balance, daily inflow forecast, list of active POs
    (amount, deadline, penalty rate) — all pulled from Credex DB
  - Output: day-by-day payment schedule + alert flags
- [ ] Explainability layer — plain language reason for each recommendation
- [ ] Node backend calls /optimize and returns results to frontend

### Credit Risk Model (carry from LOANlo)
- [ ] XGBoost .pkl model already exists — reuse in the same FastAPI service
- [ ] POST /credit-risk endpoint (already integrated in LOANlo, port to new service)
- [ ] Extend inputs to include Credex transaction data (not just loan application data)

### Credit Score Engine (new)
- [ ] POST /credit-score endpoint
  - Inputs: payment history, timeliness rate, dispute count, order volume,
    review average, verification status
  - Output: numerical score (300–900 scale) + tier label
- [ ] Scheduled job: recompute credit scores for all active users daily

---

## Phase 4 — Frontend (Next.js)
**Time estimate: 4–6 weeks**
**Build after backend APIs are stable**

### Design System
- [ ] Tailwind CSS configuration — define colour palette, typography, spacing
- [ ] Consider VenPayRL's aesthetic as inspiration: warm, clean, modern
  (#F5F3EF cream, DM Serif Display for headings, Inter for body)
- [ ] Component library: buttons, inputs, modals, cards, tables, skeletons,
      toast notifications — build these first before pages

### Pages — Buyer
- [ ] Auth: register, login, forgot password, reset password
- [ ] Dashboard: overview of active POs, payment schedule from optimizer,
      credit score, notifications
- [ ] Supplier discovery: search, browse, filters
- [ ] Supplier profile page (with products, reviews, credit score/badge)
- [ ] Product detail page
- [ ] RFQ submission flow
- [ ] Negotiation view (counter offers, chat)
- [ ] Active POs list + individual PO detail
- [ ] Payment flow (mark payment, partial payment)
- [ ] Cash flow optimizer view (schedule table, alert list, explainability)
- [ ] Loan application flow (multi-step)
- [ ] Loan status tracker
- [ ] Profile page + edit profile
- [ ] Reviews (submit, view)

### Pages — Supplier
- [ ] Dashboard: active listings, incoming RFQs, payment status
- [ ] Product management (create, edit inline, delete)
- [ ] Image upload
- [ ] RFQ management (view, accept, reject, counter)
- [ ] Active POs list
- [ ] Payment received tracker
- [ ] Profile page + edit
- [ ] Reviews (view received)
- [ ] Cash flow optimizer (supplier-side: receivables view)

### Pages — Underwriter
- [ ] Dashboard: incoming loan applications, queue
- [ ] Application detail view
- [ ] Document vault viewer (signed URL access, logged)
- [ ] Approve / reject / request documents actions
- [ ] Profile

### Admin Frontend (separate subdomain)
- [ ] IP-restricted access (handled at infra level)
- [ ] Login with 2FA (authenticator app)
- [ ] DB overview dashboard — all collections, filterable, sortable
- [ ] User management (view, soft delete, restore)
- [ ] Loan application management (view, restore)
- [ ] PO management (view, cancel)
- [ ] Audit log viewer
- [ ] Session management (view all active sessions, remote terminate)
- [ ] Credit score overrides (if needed)

---

## Phase 5 — Integration, Testing & Hardening
**Time estimate: 2–3 weeks**

- [ ] End-to-end flow testing: register → list product → RFQ → negotiate →
      PO → payment → review
- [ ] End-to-end loan flow: PO confirmed → loan application → document upload →
      underwriter review → approval → EMI tracked in optimizer
- [ ] Optimizer integration test: real PO data flows into Python service,
      schedule returned and displayed correctly
- [ ] Security audit:
  - All S3 URLs are signed + expiring (no public access)
  - Admin routes IP-restricted
  - JWT validation on all protected routes
  - Input sanitisation everywhere
  - Rate limiting on auth endpoints
- [ ] DPDP Act 2023 compliance:
  - Data deletion request flow
  - Data retention policy enforced in code
  - Privacy policy page
- [ ] Load test critical endpoints (optimizer, document upload, search)
- [ ] Error handling audit — every API endpoint returns consistent error shapes

---

## Phase 6 — Deployment
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
| 1 | Backend foundation | 🔄 ~70% done | 1–2 weeks |
| 2 | Loan marketplace + document vault | ⏳ | 2–3 weeks |
| 3 | Python ML microservice | ⏳ | 2–3 weeks |
| 4 | Next.js frontend | ⏳ | 4–6 weeks |
| 5 | Testing + hardening | ⏳ | 2–3 weeks |
| 6 | Deployment | ⏳ | 1 week |
| **Total remaining** | | | **~12–18 weeks** |

---

## What To Build Next (Immediate)

Phase 1 is ~70% done. Complete it before moving to Phase 2.

**Next batch to build:**
1. Review model + controller + routes
2. Notification read endpoint (GET + PATCH)
3. Chat model + controller + routes
4. S3 image upload (products + company logos)
5. Cron jobs (payment due reminders + RFQ expiry)

Then Phase 2 starts: LoanType → LoanApplication → Document vault → Underwriter flow.
## The One Thing To Remember

> The cash flow optimizer and credit scoring engine are Credex's moat.
> But they are useless without real PO and payment data.
> Build the marketplace first. The intelligence follows.

---

*Maintained by: Aniruddh Ballal*
*Last updated: April 2026*