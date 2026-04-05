# Build Roadmap — B2B Procurement & Embedded Trade Finance Platform

## Who This Is Written For

A solo technical founder, pre-graduation, early stage — who has a clear product vision
but hasn't yet validated the business questions (target user, money flow, business model).
This roadmap is written with that reality in mind.

**The core principle here is: don't build what you can't yet validate.**
Build the minimum that lets real users show you what to build next.

---

## The Honest Truth Before You Start

You have a platform idea with ~6 interconnected systems:
1. A marketplace
2. A negotiation + order management system
3. A payment tracking system
4. A cash flow optimisation engine
5. A lending marketplace
6. A trust + credit scoring engine

If you try to build all 6 at once, you will:
- Take 2–3 years to ship anything
- Run out of motivation halfway
- Build things nobody ends up using
- Have no idea which part actually solves a real problem

The right approach is to build in **layers** — each layer is usable on its own,
and each layer generates the data and learning that justifies building the next one.

---

## Layer 0 — Before You Write a Single Line of Code

**Time estimate: 2–4 weeks**

This is the most important layer. It costs nothing but time.

### What to do:
- Talk to 10 real business owners (buyers or suppliers — anyone who runs a business
  that buys from or sells to other businesses)
- Ask them 5 questions:
  1. How do you currently find suppliers / get found by buyers?
  2. How do you handle payment terms with them?
  3. Have you ever had a cash flow problem because of delayed payments?
  4. Have you ever applied for a business loan? What happened?
  5. If there was a platform that handled all of this, what's the one thing
     you'd want it to do really well?
- Write down what you hear — patterns will emerge

### What you're trying to answer:
- Which sector/industry to focus on first
- Whether the cash flow optimizer is the hero feature or just a nice-to-have
- Whether the loan marketplace is something people actually want or just sounds good

### Why this comes before code:
Because every answer you get will change what you build.
If 8 out of 10 people say "I don't care about loans, I just want to find
reliable suppliers and get paid on time" — that completely changes your Phase 1.

### Deliverable:
A single page of notes — what you heard, what the common pain points were,
and which user type (buyer or supplier) felt the most pain.

---

## Layer 1 — The Core Marketplace (MVP)

**Time estimate: 3–5 months of focused building**
**Goal: Get real buyers and suppliers transacting on the platform**

This is the foundation everything else sits on. Without real transactions,
you have no data. Without data, the cash flow optimizer and credit score engine
are useless. So this comes first.

### What to build:

#### Authentication & Onboarding
- Email/password signup + OTP verification
- Role selection at signup: Supplier or Buyer
- Basic profile — company name, GST number, industry, location
- Document upload for verification (store securely, review manually at this stage)
- Simple verified badge once reviewed

#### Supplier Side
- Product/service listing with:
  - Name, description, category, photos
  - Base price and pricing unit (per unit, per hour, per project)
  - Payment methods accepted
  - Financing options available (checkboxes — immediate, deferred 30/60/90 days, open to discuss)
- Supplier dashboard — view incoming RFQs, manage listings

#### Buyer Side
- Search and browse supplier listings (keyword + category filter to start)
- Submit an RFQ to a supplier — specify quantity, preferred payment method,
  any customisation needed
- Buyer dashboard — view submitted RFQs and their status

#### Negotiation & Order Flow
- Supplier receives RFQ notification (email)
- Supplier can accept, reject, or counter (structured form — change price,
  change payment terms, change deadline)
- Buyer sees the counter, can accept or counter back
- Once both accept — Purchase Order (PO) is created and locked
- PO records: parties, product, price, financing method, payment deadline (if deferred)

#### Payment Tracking (Manual at this stage)
- Buyer marks payment as sent
- Supplier confirms payment received
- PO status updates to: Pending → In Progress → Payment Due → Completed
- No actual money movement through the platform yet — just tracking

#### Reviews
- Once PO is marked complete, both parties are prompted to review each other
- Star rating + written comment
- Displayed on profiles

#### Email Notifications
- Trigger on every status change: RFQ received, counter made, PO confirmed,
  payment due reminder (3 days before deadline), payment confirmed, review received

#### Admin Panel (Basic)
- Internal-only (not public-facing yet, can be a simple tool like Django Admin
  or a basic custom panel)
- View all users, all POs, all documents
- Manually verify/reject user accounts
- Soft delete any record

### What you are NOT building in Layer 1:
- Cash flow optimizer
- Loan marketplace
- Credit scoring engine
- Bank underwriter accounts
- Separate admin frontend
- Mobile app
- Anything with actual money movement

### Why:
Because you need real transaction data before the optimizer and credit engine
mean anything. And you need real users before you build a complex admin system.

### What success looks like:
- 20–30 active suppliers with real listings
- 10–15 active buyers who have submitted at least one RFQ
- At least 5 completed POs (even small ones)
- Real feedback from users on what's broken or missing

---

## Layer 2 — Trust, Credit & Cash Flow Intelligence

**Time estimate: 3–4 months**
**Prerequisite: Layer 1 is live with real transactions happening**
**Goal: Make the platform smarter and stickier using the data you've collected**

### What to build:

#### Credit Scoring Engine
- Inputs from Layer 1 data:
  - Payment timeliness (paid before/on/after deadline)
  - Dispute rate
  - Order volume and frequency
  - Review scores received
  - Verification status
- Output: a numerical score (e.g. 300–900, similar to CIBIL framing) + a tier label
  (e.g. Platinum / Gold / Silver / Unrated)
- Displayed on user profiles
- Used later by bank underwriters (Layer 3) to assess loan applications

#### Trust Badge System
- Define clear criteria for the green tick / verified badge
  (e.g. GST verified + 3+ completed POs + credit score above X + no open disputes)
- Automate badge assignment based on criteria being met

#### Cash Flow Optimiser (V1)
- Build this as a standalone tool within the buyer's dashboard
- Inputs (manually entered by buyer to start):
  - Current cash balance
  - Expected inflows (date + amount) for the next 30/60/90 days
  - All outstanding payables pulled automatically from their active POs on the platform
    (deadline, amount, penalty per day of delay)
- Engine: Linear Programming model (use Python + PuLP or OR-Tools)
  - Objective: minimise total penalties while keeping cash balance above zero at all times
  - Output: a day-by-day payment schedule — pay X to Supplier A on Day 5,
    pay Y to Supplier B on Day 12, etc.
- Display as a simple table/calendar in the UI
- Add an alert system: "Pay Supplier A in the next 2 days to avoid ₹3,000 penalty"

#### Enhanced Search & Discovery
- Add filters: verified only, minimum credit score, financing options accepted,
  category, location
- "Recently worked with" and "Frequently bought" signals on supplier profiles

### What success looks like:
- Buyers are logging in to check the cash flow optimizer (engagement signal)
- Credit scores are being used by buyers to choose suppliers
- You have enough transaction history to see patterns in payment behaviour

---

## Layer 3 — Lending Marketplace

**Time estimate: 4–6 months**
**Prerequisite: Layer 2 live, credit scores are meaningful, you have regulatory clarity**
**Goal: Connect buyers who need financing with banks/NBFCs on-platform**

### Important note before building this:
Before Layer 3, you need to have spoken to a lawyer or compliance advisor
about whether you need to register as a Loan Service Provider (LSP) or
Direct Selling Agent (DSA) under RBI guidelines. This is non-negotiable —
operating a loan marketplace without the right registration is a legal risk.
This doesn't mean you can't build it — it means you need to understand
what box you fall into first.

### What to build:

#### Loan Application Flow (Buyer Side)
- Within a confirmed PO, buyer can click "Apply for Financing"
- Buyer selects loan type: working capital loan, LAP, invoice discounting, etc.
- Buyer fills application: amount needed, tenure, linked PO details
- Buyer uploads KYC documents to the secure document vault:
  - GST certificate
  - PAN
  - Incorporation certificate
  - Last 6 months bank statements
  - Last 2 years ITR
  - Audited financials (if available)
- Application submitted — status: Under Review

#### Secure Document Vault
- Encrypted file storage (AWS S3 + KMS or equivalent)
- No public URLs — all access via signed, expiring links (15–30 min expiry)
- Access log — every document view is recorded (who, when)
- Documents tagged by type for easy underwriter navigation

#### Bank Underwriter Accounts
- Separate onboarding for bank/NBFC underwriters
- Underwriter dashboard:
  - View incoming loan applications
  - Filter by loan type, amount, applicant credit score, date
  - View applicant profile, credit score, transaction history on platform
  - Access documents via secure vault
  - Actions: Approve / Reject / Request Additional Documents
- Email notifications for every application action

#### Loan Status Tracking
- Buyer sees real-time loan status: Submitted → Under Review →
  Documents Requested → Approved / Rejected
- If approved: loan amount, tenure, interest rate, EMI schedule recorded on platform
- EMI tracking added to buyer's cash flow optimizer automatically

#### Admin Oversight for Loans
- Admins can view all loan applications, their status, and all documents
- Can soft delete or restore loan applications
- Can flag applications for review

### What success looks like:
- At least 2–3 bank/NBFC partners onboarded as underwriters
- First loan approved through the platform
- Buyers are using financing to close orders they couldn't have otherwise

---

## Layer 4 — Hardening, Compliance & Scale

**Time estimate: Ongoing from Layer 3 onwards**
**Goal: Make the platform production-grade, secure, and legally sound**

### What to build:

#### Separate Admin Frontend
- Move admin panel to a separate subdomain (e.g. admin.yourplatform.com)
- IP allowlisting at the infrastructure/network level (not just application level)
- 2FA via authenticator app (Google Authenticator / Authy)
- Role-scoped permissions within admins (finance admin, user admin, loan admin)
- Full audit log UI — admins can see every action taken by every admin

#### Security Hardening
- AES-256 encryption at rest for all documents and sensitive data
- TLS 1.3 in transit
- Penetration testing before going live with loan features
- Rate limiting on all APIs
- DPDP Act 2023 compliance:
  - User data deletion request flow
  - Data retention policy implemented in code
  - Privacy policy updated

#### WhatsApp / SMS Notifications
- Integrate WhatsApp Business API for payment reminders
- SMS fallback for OTPs and urgent alerts
- In-app notification centre (bell icon + feed)

#### Mobile Responsiveness / App
- Ensure web platform is fully mobile responsive
- Evaluate whether a mobile app (React Native or Flutter) is worth building
  based on how users are actually accessing the platform

#### Cash Flow Optimiser (V2)
- Integrate with accounting software APIs (Zoho Books, Tally, QuickBooks)
  so cash inflow data is pulled automatically instead of manually entered
- Add time-series ML forecasting for inflows
  (Prophet or similar — predicts future inflows based on historical patterns)
- Make the optimizer's recommendations explainable
  ("We recommend paying Supplier B today because their penalty kicks in tomorrow
  and you have sufficient balance after expected inflow of ₹2L from Client X")

---

## Summary — What Gets Built When

| Layer | What | When | Prerequisite |
|---|---|---|---|
| 0 | Talk to real users | Before any code | Nothing |
| 1 | Core marketplace — listings, RFQ, PO, payment tracking, reviews, basic admin | Months 1–5 | Layer 0 insights |
| 2 | Credit scoring, cash flow optimizer V1, trust badges, better search | Months 6–9 | Real transactions from Layer 1 |
| 3 | Loan marketplace, document vault, underwriter accounts, loan tracking | Months 10–15 | Credit scores from Layer 2 + legal clarity |
| 4 | Admin hardening, security, DPDP compliance, mobile, optimizer V2 | Months 15+ | Everything before |

---

## Tech Stack Recommendation (for a Solo Technical Founder)

Don't overthink this. Pick things you can move fast with.

| Part | Recommendation | Why |
|---|---|---|
| Backend | Python (FastAPI or Django) | Fast to build, huge ecosystem for ML/optimisation later |
| Frontend | Next.js (React) | SSR for SEO, good component ecosystem, one codebase for web |
| Database | PostgreSQL | Relational data with complex relationships — this is the right fit |
| File storage | AWS S3 + KMS | Industry standard for secure document storage |
| Email | Resend or AWS SES | Reliable, cheap, easy to integrate |
| Payments (later) | Razorpay or Cashfree | Licensed aggregators, handles RBI compliance for you |
| Optimiser | Python + PuLP (LP solver) | Simple, well-documented, runs serverside |
| Hosting | AWS or Railway (to start) | Railway is fast to get started; migrate to AWS as you scale |
| Auth | Supabase Auth or Auth0 | Don't build auth from scratch |

---

## The One Thing to Remember

> The cash flow optimizer and the credit scoring engine are your moat —
> nobody else in the Indian B2B marketplace space has them.
> But they are useless without real transaction data.
> So the only way to get to your moat is to first build the boring marketplace
> that generates that data.
>
> Build the boring thing first. The intelligent thing will follow.

---

*Document status: Living document — update as layers are completed and learnings come in*
*Last updated: April 2026*