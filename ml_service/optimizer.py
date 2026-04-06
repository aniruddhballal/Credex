"""
POST /optimize

Input:  buyer's current cash, daily inflow forecast, list of active POs
Output: day-by-day payment schedule, alert flags, projected cash balance curve

The optimizer is intentionally read-only — it never writes to any database.
It is a pure function: same inputs always produce the same output.

Solver: PuLP with the CBC open-source LP solver (no licence required).

LP formulation:
  Decision variable: pay[i][t] = amount paid to PO i on day t (continuous ≥ 0)
  Constraints:
    - Cash balance never goes negative on any day
    - Total paid to each PO ≤ amountRemaining
    - No payments scheduled past the PO's deadline
  Objective: minimise total penalty accrued across all POs
    penalty[i] = penaltyRatePerDay[i] × max(0, lateDays[i]) × amountRemaining[i]
    We approximate this by penalising any unpaid balance that remains after deadline.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Optional
import math

from fastapi import APIRouter
from pydantic import BaseModel, Field
import pulp

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class DailyInflow(BaseModel):
    date: date
    amount: float  # in paise (integer value, but float accepted for LP)


class Payable(BaseModel):
    purchaseOrderId: str
    supplierName: str
    amountRemaining: float        # paise
    deadline: date
    penaltyRatePerDay: float      # % per day e.g. 0.05 = 0.05%


class OptimizeRequest(BaseModel):
    currentCash: float = Field(..., description="Current cash balance in paise")
    dailyInflows: list[DailyInflow] = Field(default_factory=list)
    payables: list[Payable] = Field(..., min_length=0)


class ScheduledPayment(BaseModel):
    date: date
    purchaseOrderId: str
    supplierName: str
    amountToPay: float
    reason: str


class Alert(BaseModel):
    purchaseOrderId: str
    urgency: str          # "high" | "medium" | "low"
    message: str


class ProjectedBalance(BaseModel):
    date: date
    balance: float


class OptimizeResponse(BaseModel):
    paymentSchedule: list[ScheduledPayment]
    alerts: list[Alert]
    projectedCashBalance: list[ProjectedBalance]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_inflow_map(inflows: list[DailyInflow], days: list[date]) -> dict[date, float]:
    """Map each day in the horizon to its expected inflow (0 if none specified)."""
    inflow_map: dict[date, float] = {d: 0.0 for d in days}
    for inflow in inflows:
        if inflow.date in inflow_map:
            inflow_map[inflow.date] += inflow.amount
    return inflow_map


def _build_reason(po: Payable, pay_day: date, amount: float, today: date) -> str:
    """Generate a plain-language explanation for each scheduled payment."""
    days_to_deadline = (po.deadline - pay_day).days
    days_from_today = (pay_day - today).days

    if days_from_today == 0:
        timing = "today"
    elif days_from_today == 1:
        timing = "tomorrow"
    else:
        timing = f"in {days_from_today} days"

    if days_to_deadline < 0:
        urgency = f"⚠️ deadline already passed — penalty accruing at {po.penaltyRatePerDay}%/day"
    elif days_to_deadline == 0:
        urgency = "deadline is today — pay now to avoid penalties"
    elif days_to_deadline <= 3:
        urgency = f"deadline in {days_to_deadline} day(s) — paying {timing} avoids full penalty"
    else:
        urgency = f"{days_to_deadline} days until deadline"

    amount_inr = amount / 100
    return f"Pay ₹{amount_inr:,.0f} to {po.supplierName} — {urgency}."


def _build_alerts(payables: list[Payable], today: date) -> list[Alert]:
    alerts: list[Alert] = []
    for po in payables:
        if po.amountRemaining <= 0:
            continue
        days_to_deadline = (po.deadline - today).days
        daily_penalty = po.penaltyRatePerDay / 100 * po.amountRemaining
        daily_penalty_inr = daily_penalty / 100

        if days_to_deadline < 0:
            alerts.append(Alert(
                purchaseOrderId=po.purchaseOrderId,
                urgency="high",
                message=(
                    f"{po.supplierName} payment is overdue by {abs(days_to_deadline)} day(s). "
                    f"Penalty accruing: ₹{daily_penalty_inr:,.0f}/day."
                )
            ))
        elif days_to_deadline <= 3:
            alerts.append(Alert(
                purchaseOrderId=po.purchaseOrderId,
                urgency="high",
                message=(
                    f"{po.supplierName} payment due in {days_to_deadline} day(s). "
                    f"₹{po.amountRemaining / 100:,.0f} outstanding. "
                    f"Penalty if missed: ₹{daily_penalty_inr:,.0f}/day."
                )
            ))
        elif days_to_deadline <= 7:
            alerts.append(Alert(
                purchaseOrderId=po.purchaseOrderId,
                urgency="medium",
                message=(
                    f"{po.supplierName} payment due in {days_to_deadline} days. "
                    f"₹{po.amountRemaining / 100:,.0f} outstanding."
                )
            ))
        else:
            alerts.append(Alert(
                purchaseOrderId=po.purchaseOrderId,
                urgency="low",
                message=(
                    f"{po.supplierName} — ₹{po.amountRemaining / 100:,.0f} due "
                    f"on {po.deadline.strftime('%d %b %Y')}."
                )
            ))

    # Sort: high → medium → low
    urgency_order = {"high": 0, "medium": 1, "low": 2}
    alerts.sort(key=lambda a: urgency_order[a.urgency])
    return alerts


# ---------------------------------------------------------------------------
# LP Solver
# ---------------------------------------------------------------------------

def _solve(
    current_cash: float,
    inflow_map: dict[date, float],
    payables: list[Payable],
    days: list[date],
) -> dict[str, dict[date, float]]:
    """
    Solve the LP.
    Returns pay[purchaseOrderId][day] = amount to pay.
    """
    if not payables or not days:
        return {}

    prob = pulp.LpProblem("credex_cashflow", pulp.LpMinimize)

    # Decision variables: pay[i][t] >= 0
    pay: dict[str, dict[date, pulp.LpVariable]] = {}
    for po in payables:
        pay[po.purchaseOrderId] = {}
        for day in days:
            if day <= po.deadline:   # no payment after deadline in the schedule
                var_name = f"pay_{po.purchaseOrderId[:8]}_{day.isoformat()}"
                pay[po.purchaseOrderId][day] = pulp.LpVariable(var_name, lowBound=0)

    # Objective: minimise total penalty
    # We penalise the unpaid balance remaining after the deadline,
    # weighted by how many days past the deadline we are in the horizon.
    horizon_end = days[-1]
    penalty_terms = []
    for po in payables:
        # Amount that will remain unpaid (if any)
        total_paid = pulp.lpSum(pay[po.purchaseOrderId].values())
        unpaid = po.amountRemaining - total_paid
        # Days overdue at horizon end (minimum 0)
        days_overdue = max(0, (horizon_end - po.deadline).days)
        daily_penalty_rate = po.penaltyRatePerDay / 100
        penalty_terms.append(daily_penalty_rate * days_overdue * unpaid)

    prob += pulp.lpSum(penalty_terms)

    # Constraint: total paid per PO ≤ amountRemaining
    for po in payables:
        prob += pulp.lpSum(pay[po.purchaseOrderId].values()) <= po.amountRemaining

    # Constraint: cash balance ≥ 0 on every day
    for t_idx, day in enumerate(days):
        days_up_to = days[: t_idx + 1]
        cumulative_inflows = pulp.lpSum(inflow_map[d] for d in days_up_to)
        cumulative_payments = pulp.lpSum(
            pay[po.purchaseOrderId][d]
            for po in payables
            for d in days_up_to
            if d in pay[po.purchaseOrderId]
        )
        prob += current_cash + cumulative_inflows - cumulative_payments >= 0

    # Solve (CBC solver bundled with PuLP — no external binary needed on Render)
    solver = pulp.PULP_CBC_CMD(msg=0)
    prob.solve(solver)

    result: dict[str, dict[date, float]] = {}
    if pulp.LpStatus[prob.status] == "Optimal":
        for po in payables:
            result[po.purchaseOrderId] = {}
            for day, var in pay[po.purchaseOrderId].items():
                value = pulp.value(var) or 0.0
                if value > 1:  # ignore sub-paise floating point noise
                    result[po.purchaseOrderId][day] = round(value)

    return result


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post("", response_model=OptimizeResponse)
async def optimize(req: OptimizeRequest) -> OptimizeResponse:
    today = date.today()

    # If no payables, return empty schedule
    if not req.payables:
        return OptimizeResponse(
            paymentSchedule=[],
            alerts=[],
            projectedCashBalance=[
                ProjectedBalance(date=today + timedelta(days=i), balance=req.currentCash)
                for i in range(30)
            ],
        )

    # Build 90-day horizon (or up to last deadline + 7 days, whichever is longer)
    latest_deadline = max(p.deadline for p in req.payables)
    horizon_days = max(90, (latest_deadline - today).days + 7)
    days = [today + timedelta(days=i) for i in range(horizon_days)]

    inflow_map = _build_inflow_map(req.dailyInflows, days)

    # Solve LP
    schedule_map = _solve(req.currentCash, inflow_map, req.payables, days)

    # Build payable lookup
    po_lookup = {po.purchaseOrderId: po for po in req.payables}

    # Build payment schedule (only days with non-zero payments)
    payment_schedule: list[ScheduledPayment] = []
    for po_id, day_amounts in schedule_map.items():
        for day, amount in day_amounts.items():
            if amount > 0:
                po = po_lookup[po_id]
                payment_schedule.append(ScheduledPayment(
                    date=day,
                    purchaseOrderId=po_id,
                    supplierName=po.supplierName,
                    amountToPay=amount,
                    reason=_build_reason(po, day, amount, today),
                ))

    payment_schedule.sort(key=lambda p: p.date)

    # Build projected cash balance curve
    # Running balance = currentCash + inflows - payments each day
    payments_by_day: dict[date, float] = {}
    for day_amounts in schedule_map.values():
        for day, amount in day_amounts.items():
            payments_by_day[day] = payments_by_day.get(day, 0.0) + amount

    projected: list[ProjectedBalance] = []
    balance = req.currentCash
    display_days = days[:90]  # show max 90 days in the curve
    for day in display_days:
        balance += inflow_map.get(day, 0.0)
        balance -= payments_by_day.get(day, 0.0)
        projected.append(ProjectedBalance(date=day, balance=max(0.0, balance)))

    # Alerts
    alerts = _build_alerts(req.payables, today)

    return OptimizeResponse(
        paymentSchedule=payment_schedule,
        alerts=alerts,
        projectedCashBalance=projected,
    )