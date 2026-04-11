The backend needs more fixes than the frontend — 17 fixes vs 13. This is expected: the backend was built first and the frontend team made reasonable assumptions about URLs and field names that diverged slightly from what was actually built.
The single most important fix on both sides is FIX 12 / the response wrapper issue. The backend returns { success: true, user: {...} } with fields at root level. The frontend expects { success: true, data: {...} } with a data wrapper. This mismatch means every single API response is being parsed incorrectly right now. Fix this first, coordinate the deployment on both sides simultaneously, or every page breaks worse temporarily.
The three things that break the most functionality:

Response wrapper — affects every page
Missing dashboard endpoints — buyer, supplier, and underwriter dashboards are all blank
Underwriter URL namespace — the entire underwriter flow (queue, review, approve, document view) points to /api/underwriter/* which the backend never built

One subtle logic bug worth calling out specifically — the supplier's RFQ accept button currently redirects to /supplier/purchase-orders after accepting. But per your business rules, the buyer creates the PO from the accepted RFQ, not the supplier. So the supplier's flow is wrong — they should redirect back to the RFQ list with a "waiting for buyer to confirm" message.
Share the files with your respective teams and tell them to work through the priority order listed in each document — top to bottom.