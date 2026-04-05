# Open Questions — B2B Procurement & Trade Finance Platform

These are the questions that need answers before a full product/technical specification can be written. They are grouped by theme and roughly prioritised — the ones at the top have the biggest downstream impact on everything else.

---

## 🔴 Priority 1 — Answer These First (Everything Else Depends On Them)

### Target User
1. What **size of company** are you targeting — early-stage startups, SMEs (₹5–50Cr revenue), mid-market enterprises, large corporates?
2. What **industry or sector** is the primary focus — raw materials, manufacturing, services, SaaS, construction, FMCG, something else?
3. What **geography** are you launching in first — one city, one state, pan-India?
4. Is there a specific type of buyer or supplier you want to onboard first to prove the model?

### How Money Actually Moves
5. When a buyer pays a supplier, does money **pass through your platform**, or does the platform only **track the obligation** while parties pay each other directly?
6. If money passes through the platform (even temporarily), are you prepared for the **RBI payment aggregator licensing** requirement?
7. Are you planning to **partner with a licensed payment aggregator** (e.g. Razorpay, Cashfree) rather than obtain your own license?
8. When a bank approves a loan, does the money go **to the buyer**, or **directly to the supplier** on the buyer's behalf?

### Business Model — How Does the Platform Make Money?
9. Will suppliers pay a **subscription or listing fee** to be on the platform?
10. Will the platform take a **transaction fee / commission** on confirmed orders?
11. Will the platform earn a **referral or origination fee** from banks when a loan is approved?
12. Is the **cash flow optimiser** a free feature or a **paid/premium feature**?
13. Is there a **freemium model** — basic access free, advanced finance features paid?

---

## 🟠 Priority 2 — Needed Before Build Starts

### Dispute Resolution
14. If a buyer says the supplier delivered defective goods, who arbitrates? Is there an in-platform dispute process?
15. If a buyer disputes a penalty clause they claim they didn't agree to, how is that resolved?
16. If a loan is approved but the underlying order falls through, what happens to the loan?
17. Can a supplier appeal a negative review they believe is unfair? Who reviews such appeals?
18. What is the maximum time allowed for dispute resolution before escalation?

### Onboarding & Verification
19. What documents do you collect from a buyer at signup? (GST, PAN, incorporation certificate, bank statements, ITR?)
20. What documents do you collect from a supplier at signup?
21. Is verification **manual** (your team reviews), **automated** (via KYC APIs like Karza, Setu, Perfios), or a **combination**?
22. What can an **unverified user** do on the platform vs a **verified user**?
23. How long is the expected verification turnaround, and what happens during the waiting period?
24. What criteria does a user need to meet to earn the **trust badge / green tick**?

### Default & Non-Payment Consequences
25. If a buyer misses a payment deadline, what happens automatically on the platform?
26. Is there a **grace period** before a penalty kicks in, or is it immediate?
27. Does a missed payment immediately impact the buyer's credit score?
28. Can a supplier initiate a **collections escalation** through the platform?
29. For bank loans — how is an NPA (Non-Performing Asset) handled on the platform? Does the platform have any liability?

---

## 🟡 Priority 3 — Important for Product Quality

### Supplier Discovery & Search
30. How do buyers find suppliers — keyword search, category browsing, filters (location, rating, price, financing accepted)?
31. Do you want a **recommendation engine** — "companies like yours also bought from..."?
32. Do you want a **matching engine** — proactively suggesting suppliers to buyers based on their needs/history?
33. How do you prevent suppliers from gaming search rankings or listing quality?
34. Can buyers save or favourite suppliers for repeat orders?

### Notifications & Communication
35. Beyond email, do you want **WhatsApp Business API** notifications (very high open rates for Indian SMEs)?
36. Do you want an **in-app notification centre** (bell icon with a feed of updates)?
37. If you build a mobile app later, do you want **push notifications**?
38. Are there any notification types that should be **SMS only** (e.g. OTP, urgent payment reminders)?

### Cash Flow Optimiser — Data Sources
39. Where does the buyer's **cash inflow forecast** data come from — manually entered by the user, or integrated with accounting software (Tally, Zoho Books, QuickBooks)?
40. Does the optimiser run **on-demand** (user clicks "optimise") or **automatically on a schedule** (e.g. every morning)?
41. Should the optimiser send **proactive alerts** — e.g. "Pay Supplier A today or incur ₹5,000 penalty tomorrow"?
42. Should the optimiser's recommendations be **explainable** — showing the buyer why it made a particular suggestion?

### Loan & Financing Marketplace
43. Which types of banks/lenders do you want on the platform — PSU banks, private banks, NBFCs, or all?
44. Is there a **minimum or maximum loan size** you want to support?
45. Do you want banks to **bid against each other** for a loan application (marketplace model), or does the buyer pick one bank to apply to?
46. Who sets the interest rate — the bank, or is it negotiated on-platform?
47. Are there loan products beyond loans and LAP you want to support at launch — e.g. invoice discounting, supply chain finance, overdraft lines?

---

## 🟢 Priority 4 — Operational & Compliance Decisions

### Data, Privacy & Security
48. Are you aware of and prepared to comply with India's **DPDP Act 2023** (Digital Personal Data Protection Act)?
49. What is your **data retention policy** — how long do you store documents and transaction records after a user closes their account?
50. Do you want a **user-facing data deletion request** mechanism (required under DPDP)?
51. What encryption standards are you targeting — AES-256 at rest, TLS 1.2+ in transit?
52. Do you have a **breach notification plan** — who gets notified, within what timeframe, if there's a data breach?

### Mobile vs Web
53. Is the platform **web-only at launch**, or do you want a **mobile app** from day one?
54. If web-only, should it be fully **mobile-responsive** so it works on phones?
55. Which user types are most likely to use the platform on a phone — buyers checking payment status, suppliers checking orders, or both?

### Regulatory & Licensing
56. Have you looked into whether you need to register as a **Loan Service Provider (LSP)** or **Direct Selling Agent (DSA)** under RBI guidelines given the loan marketplace feature?
57. Do you have a legal/compliance advisor familiar with RBI's fintech regulations?
58. Are you planning to handle **GST-compliant invoicing** through the platform, or leave that to the parties?

### Supplier & Buyer Can Be the Same Entity
59. Can the **same company be both a buyer and a supplier** on the platform (e.g. a manufacturer who buys raw materials and also sells finished goods)?
60. If yes, do they get one account with a toggle, or two separate accounts?

---

## 📝 Notes

- Questions marked 🔴 should be answered before any wireframing or architecture work begins
- Questions marked 🟠 should be answered before development starts
- Questions marked 🟡 and 🟢 can be answered iteratively during the build phase
- It's okay not to have all answers now — some will become clear once you speak to potential early users

---

*Document status: Open — answers to be filled in*
*Last updated: April 2026*