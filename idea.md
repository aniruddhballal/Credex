# Credex — B2B Procurement & Embedded Trade Finance Platform

## What Is This?

Credex is a **unified B2B marketplace with embedded trade finance** — built by merging three
independently developed and deployed products into one coherent platform with a shared
database, shared user identity, and shared intelligence layer.

Think of it as a combination of:
- A **procurement marketplace** (suppliers list, buyers discover and order)
- A **trade finance layer** (flexible payment structures — deferred, credit, loans, leases, etc.)
- A **cash flow optimizer** (multi-agent payment scheduling engine that tells buyers exactly
  when to pay which supplier to maximise liquidity and minimise penalties)
- A **lending marketplace** (banks and underwriters participate to approve loans on-platform)
- A **trust and compliance layer** (KYC, document vault, transaction history, credit scoring)

---

## Origin — The Three Products Being Merged

Credex is not being built from scratch. It is the unification of three existing, deployed products.
Each maps directly to a core layer of Credex.

---

### 1. VenPay → Credex Marketplace Layer

**What it is:** A B2B vendor-company marketplace. Vendors list products/services, companies
browse and request them, negotiate terms, and track payments.

**What's already built:**
- Vendor and company role-based authentication (MUI-based frontend, MERN stack)
- Product listings with images (Cloudinary), inline editing, hover card UI
- Product request flow: company requests product → vendor accepts/declines/counters
- Payment tracking per request: unpaid → partially paid → paid (password re-entry on payment)
- Manual deadline setting per request with deadline warning system
- Reviews and star ratings for products, vendors, and companies
- Individual profile pages for vendors, companies, and products (all cross-linked)
- Protected routes — only logged-in users can view profiles
- Edit profile functionality (inline for products, page-based for users)
- Deployed: Vercel frontend + Render backend + MongoDB Atlas

**Stack:** Vite + React + TypeScript + MUI + Express + MongoDB

**Key gaps being resolved in Credex:**
- No in-app chat between vendor and company
- No structured financing type selection (loan, lease, deferred, equity, etc.)
- Payment doesn't move real money — tracked manually only
- No notifications system
- No admin panel
- MUI → being replaced with Tailwind in the unified build

---

### 2. LOANlo → Credex Lending Marketplace Layer

**What it is:** A loan origination system (LOS) where applicants apply for loans,
upload KYC documents, and bank underwriters review and decide.

**What's already built:**
- Three user roles: Applicant, Underwriter, System Admin
- Full multi-step loan application form
- Document vault — type-tagged uploads (GST, PAN, incorporation cert, ITR, bank statements)
  with progress visualization and secure storage
- Underwriter dashboard — view applications, review documents, approve/reject/request more docs
- Loan status state machine: pending → under_review → approved / rejected /
  request_documents → pending
- System Admin dashboard — view all applicants, restore soft-deleted records
- IP allowlisting for system admin login
- Session management — all login sessions tracked (device, IP, timestamp)
- Remote logout — admin can log out any user from any device
- Auto-logout after 15 minutes of inactivity
- Audit trail — login audit collection, session termination reasons logged
- Password reset flow (token-based, 30-min expiry)
- Email system — Gmail API with OAuth2, 15+ templates covering full application lifecycle
- XSS protection, input sanitisation
- Soft delete + admin restoration for applications and profiles
- Credit risk ML microservice — standalone FastAPI Python service with XGBoost model,
  integrated via /api/credit-risk route in Node backend
- Deployed: Vercel frontend + Render backend + MongoDB Atlas

**Stack:** Vite + React + TypeScript + Tailwind CSS + Express + TypeScript + MongoDB

---

### 3. VenPayRL → Credex Cash Flow Optimiser Layer

**What it is:** A vendor payment scheduling simulator with multiple AI agents that learn
to pay invoices at the right time to maximise reward (minimise penalties, preserve cash).

**What's already built:**
- Full simulation engine — step-by-step, seeded RNG, hard constraints
  (no negative cash, no overpaying, sub-dollar remainder clearing)
- 5 agent types:
  - Rule-based — three-pass payment strategy (urgency-sorted, parallel partials)
  - Random — untrained baseline
  - Heuristic — urgency score (penaltyRate / daysUntilDue), three-pass strategy
  - Q-table — 180-state tabular Q-learning with epsilon-greedy exploration
  - DQN — two-layer neural net (64→64→3), TensorFlow.js, experience replay,
    6-dimensional state vector including amountRatio
- 5 hardcoded scenarios + unlimited custom scenarios with daily cash inflow
- Custom scenario builder (drawer UI, pre-filled test values)
- SSE streaming for live training updates
- Full benchmark suite: all agents × all scenarios × configurable seeds
- Hyperparameter sweep with ranked results
- Episode training chart with convergence annotation
- Action heatmap (colour-coded per-invoice decisions)
- Health check endpoint
- 51 Vitest tests (simulation, metrics, agents)
- CSV/JSON export
- Wealthsimple/Mercury/Stripe aesthetic: warm cream #F5F3EF, DM Serif, Inter
- Deployed: Vercel frontend + Render backend (in-memory state)

**Stack:** Vite + React + TypeScript + Tailwind CSS v4 + Express + TypeScript +
TensorFlow.js + Recharts + Vitest

**Key gaps being resolved in Credex:**
- Currently a simulator only — operates on hypothetical scenarios
- In Credex: replaced with real PO data pulled from the unified database
- DQN blocks Express thread on long runs → moved to Python microservice
- No persistent weights across restarts → resolved in Python with model serialisation

---

## Credex — The Unified Platform

### Architecture Decision
**Option A: Full rewrite and merge.**
- One new Next.js frontend (Tailwind CSS throughout)
- One new Node.js + Express + TypeScript backend
- One new MongoDB Atlas database (unified schema)
- One Python FastAPI microservice (cash flow optimiser + credit risk ML)
- Old three deployments remain live and independent

### User Types

| Role | Description |
|---|---|
| **Supplier** | Lists products/services, receives RFQs, negotiates, confirms POs |
| **Buyer** | Browses listings, submits RFQs, manages payables, uses cash flow optimizer |
| **Bank Underwriter** | Reviews loan applications, verifies KYC documents, approves/rejects |
| **System Admin** | Oversees all platform activity, elevated privileges, IP-restricted |

### Core Features

#### Marketplace & Order Management (from VenPay)
- Supplier listings with images, pricing, financing options accepted
- Buyer search and discovery (keyword, category, filters)
- RFQ submission, structured negotiation UI + in-platform chat
- Purchase Order creation on mutual acceptance, with financing method recorded
- Payment tracking: unpaid → partially paid → paid, with deadline tracking
- Post-completion reviews and star ratings (product, supplier, buyer)

#### Cash Flow Optimiser (from VenPayRL)
- Inputs: current cash balance, expected daily inflows, all active POs with deadlines + penalties
- Agents: rule-based, heuristic, Q-table, DQN
- Output: optimal day-by-day payment schedule
- Proactive alerts for approaching penalty deadlines
- Deployed as Python FastAPI microservice called by Node backend
- Operates on real PO data from unified Credex database (not simulated)

#### Loan & Financing Marketplace (from LOANlo)
- Loan application flow linked to confirmed POs
- Secure document vault (AWS S3 + KMS, signed expiring URLs, access-logged)
- KYC document management with type-tagging
- Bank underwriter dashboard and full review workflow
- Loan status state machine
- Email notifications for every lifecycle event (Gmail API + OAuth2)

#### Trust & Credit Scoring (new — built on unified data)
- Credit score from: payment timeliness, dispute rate, order volume, reviews, verification
- Trust badge auto-assigned when criteria met
- Score visible on profiles, used by underwriters in loan evaluation

#### Admin System (from LOANlo, extended to cover all of Credex)
- Separate frontend on separate subdomain (admin.credex.in)
- IP allowlisting at infrastructure level
- 2FA via authenticator app
- Role-scoped admin permissions
- Full audit log with actor, timestamp, IP
- Soft delete + restore for all entities
- Remote session termination for any user

#### Authentication & Security
- Unified JWT auth across Buyer, Supplier, Underwriter roles
- Email + OTP login, token-based password reset
- Session management with 15-min inactivity timeout
- XSS protection, input sanitisation
- Admin: separate subdomain + IP allowlist + 2FA

#### Notifications
- Email via Gmail API + OAuth2 (architecture from LOANlo)
- Every major state change notifies relevant parties
- Future scope: WhatsApp Business API, in-app notification centre

---

## Tech Stack — Credex (Unified Build)

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js + React + TypeScript + Tailwind CSS | Replaces three Vite apps |
| Backend | Node.js + Express + TypeScript | Single API server |
| Database | MongoDB Atlas | Single unified schema |
| ML / Optimiser | Python + FastAPI | Microservice called by Node backend |
| RL Engine | Q-table + DQN logic (ported to Python) | From VenPayRL |
| Credit Risk ML | XGBoost .pkl (from LOANlo) | Reused in Python microservice |
| File Storage | AWS S3 + KMS | Replaces Cloudinary from VenPay |
| Email | Gmail API + OAuth2 | From LOANlo |
| Auth | JWT (custom, unified) | May add Auth0 later |
| Payments | Razorpay or Cashfree (future Layer) | RBI-licensed aggregator |
| Hosting | Vercel (frontend) + Render/Railway (Node + Python) | |

---

## Market Context

- Indian B2B marketplace space is competitive (IndiaMART, Udaan, OfBusiness, Moglix)
  but none have a native cash flow optimizer or multi-party lending marketplace
- MSME credit gap in India: ~$1.1 trillion; only 16% of MSMEs have formal credit access
- Embedded finance in B2B is the fastest-growing fintech segment in India (2025–2026)
- Credex's moat: proprietary transaction + payment behaviour data powering credit scoring
  and the optimizer — cannot be replicated without the user base
- Regulatory: loan marketplace requires RBI LSP/DSA registration or bank partnership;
  actual money movement requires payment aggregator license or PA partner

---

*Document status: Architecture decided — beginning unified build (Credex)*
*Maintained by: Aniruddh Ballal*
*Last updated: April 2026*