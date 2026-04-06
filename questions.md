# Open Questions — Credex

These are the genuinely unresolved questions before or during the build.
Many earlier questions are now answered by the existing three products.
This is the trimmed, current list.

---

## 🔴 Priority 1 — Resolve Before Architecture Is Finalised

### Money Flow (Most Critical)
1. When a buyer pays a supplier on Credex, does money **pass through the platform**,
   or does the platform only **track the obligation** while parties pay each other directly?
2. If money passes through the platform: are you prepared to partner with a licensed
   payment aggregator (Razorpay, Cashfree) to handle this? Or is tracking-only acceptable for V1?
3. When a bank approves a loan via Credex, does the disbursed amount go to the **buyer**,
   or **directly to the supplier** on the buyer's behalf?

### Regulatory
4. Have you (or will you before launch) spoken to a lawyer about RBI's LSP/DSA
   registration requirement for operating a loan marketplace?
5. Are you aware of DPDP Act 2023 obligations — data deletion requests, retention policy,
   breach notification? Will you implement these in the build?

---

## 🟠 Priority 2 — Needed Before First User Is Onboarded

### Target User
6. What **size of company** are you targeting first — micro businesses, SMEs, mid-market?
7. What **industry or sector** is the primary focus at launch?
8. What **geography** — one city, one state, or pan-India from day one?

### Business Model
9. How does Credex make money?
   Options: transaction fee on POs, supplier subscription/listing fee,
   loan referral/origination fee from banks, premium features (optimizer as paid tier),
   or a combination.
10. Is the cash flow optimizer a **free feature for all buyers** or a **paid/premium feature**?

### Dispute Resolution
11. If a buyer claims a supplier delivered defective goods — is there an in-platform
    dispute process, or are parties left to resolve it themselves?
12. Can a supplier appeal a negative review they believe is unfair?
13. What is the consequence of a missed payment deadline beyond a credit score impact?
    Is there a collections escalation path?

### Onboarding & Verification
14. What documents are collected from buyers and suppliers at signup?
15. Is KYC verification **manual** (you review), **automated** (KYC API like Karza/Setu/Perfios),
    or a combination?
16. What can an **unverified user** do on the platform vs a **verified user**?
17. What specific criteria earn the **trust badge / green tick**?

---

## 🟡 Priority 3 — Decide During Build

### Unified Database Schema
18. Can the **same company be both a buyer and a supplier** on Credex
    (e.g. a manufacturer who buys raw materials and also sells finished goods)?
19. If yes — one account with a role toggle, or two separate accounts?

### Cash Flow Optimiser
20. Where does the buyer's **cash inflow forecast** come from in production —
    manually entered, or integrated with accounting software (Tally, Zoho Books, QuickBooks)?
21. Should the optimizer run **on-demand** or **automatically on a schedule** (e.g. each morning)?
22. Should optimizer recommendations be **explainable in plain language**
    (e.g. "Pay Supplier B today because their penalty kicks in tomorrow and you have
    sufficient balance after expected inflow from Client X")?

### Loan Marketplace
23. Which lender types do you want on the platform at launch —
    PSU banks, private banks, NBFCs, or all?
24. Do you want banks to **bid against each other** for a loan application,
    or does the buyer pick one bank and apply to them specifically?
25. Minimum and maximum loan sizes supported?

### Notifications
26. Beyond email — do you want **WhatsApp Business API** for payment reminders?
27. Do you want an **in-app notification centre** (bell icon + feed) in V1 or later?

---

## 🟢 Priority 4 — Post-Launch Decisions

28. Mobile app (React Native / Flutter) — when, if ever?
29. Accounting software integrations (Tally, Zoho, QuickBooks) — which first?
30. International expansion — or India-only for the foreseeable future?
31. Will Credex ever offer **escrow** (hold buyer funds until delivery confirmed)?
32. Will there be a **supplier discovery / matchmaking** engine beyond search filters?

---

*Note: Questions answered by existing products (VenPay, LOANlo, VenPayRL)
have been removed from this list. The tech stack, auth architecture, email system,
session management, admin privileges, ML service architecture, and UI framework
are all resolved.*

*Last updated: April 2026*