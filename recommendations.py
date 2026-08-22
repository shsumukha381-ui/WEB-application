"""
Actionable Recommendations Engine
Analyzes the user's consolidated portfolio and generates tailored,
prioritized recommendations covering rebalancing, diversification,
risk alignment, goal progress, SIP optimization, and fund overlap.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Goal, LinkedAccount, Holding
from app.schemas import RecommendationsOut, Recommendation
from app.services import consolidation, analytics

router = APIRouter()


def _generate_recommendations(db: Session, user_id: int) -> RecommendationsOut:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    accounts = (
        db.query(LinkedAccount)
        .filter(LinkedAccount.user_id == user_id, LinkedAccount.is_active.is_(True))
        .all()
    )
    holdings = [h for acc in accounts for h in acc.holdings]
    total_value = sum(h.current_value for h in holdings)
    total_invested = sum(h.invested_value for h in holdings)
    goals = db.query(Goal).filter(Goal.user_id == user_id).all()

    recs: list[Recommendation] = []
    health_score = 70  # start at 70 and adjust

    if not holdings:
        recs.append(Recommendation(
            category="DIVERSIFY",
            severity="HIGH",
            title="No investments linked yet",
            description="Link your broker accounts, mutual fund platforms, or upload your CAS statement to get personalized recommendations.",
            action="Link your first account",
        ))
        return RecommendationsOut(recommendations=recs, score=0)

    # ── Asset Allocation vs Risk Profile ───────────────────────────
    allocation = analytics.compute_asset_allocation(holdings)
    equity_weight = next((s.weight_pct for s in allocation if s.asset_class == "EQUITY"), 0.0)
    debt_weight = next((s.weight_pct for s in allocation if s.asset_class == "DEBT"), 0.0)

    lo, hi = analytics.RISK_PROFILE_EQUITY_BAND.get(user.risk_profile, (35, 65))

    if equity_weight < lo:
        gap = lo - equity_weight
        health_score -= min(int(gap * 0.5), 15)
        recs.append(Recommendation(
            category="REBALANCE",
            severity="HIGH" if gap > 15 else "MEDIUM",
            title="Equity allocation below target",
            description=f"Your equity is at {equity_weight:.0f}% but your {user.risk_profile.title()} profile suggests {lo}-{hi}%. You may be missing long-term growth. Consider moving ₹{total_value * gap / 100:,.0f} into diversified equity funds.",
            action="Increase equity exposure",
        ))
    elif equity_weight > hi:
        excess = equity_weight - hi
        health_score -= min(int(excess * 0.4), 12)
        recs.append(Recommendation(
            category="REBALANCE",
            severity="HIGH" if excess > 20 else "MEDIUM",
            title="Equity allocation above target",
            description=f"Your equity is at {equity_weight:.0f}% vs the {lo}-{hi}% recommended for your {user.risk_profile.title()} profile. Consider rebalancing ₹{total_value * excess / 100:,.0f} into debt or hybrid funds to reduce volatility.",
            action="Reduce equity, add debt",
        ))
    else:
        health_score += 5

    # ── Diversification Check ──────────────────────────────────────
    asset_classes_present = len(allocation)
    if asset_classes_present < 3 and total_value > 50000:
        health_score -= 8
        missing = [ac for ac in ["EQUITY", "DEBT", "GOLD"] if not any(s.asset_class == ac for s in allocation)]
        recs.append(Recommendation(
            category="DIVERSIFY",
            severity="MEDIUM",
            title="Limited asset class diversification",
            description=f"You're invested in only {asset_classes_present} asset class(es). Adding {', '.join(missing)} exposure can reduce portfolio volatility and improve risk-adjusted returns.",
            action=f"Add {missing[0].title() if missing else 'more'} funds",
        ))
    elif asset_classes_present >= 4:
        health_score += 3

    # ── Fund Overlap ───────────────────────────────────────────────
    overlaps = analytics.compute_fund_overlaps(holdings)
    if overlaps:
        worst = overlaps[0]
        health_score -= min(len(overlaps) * 3, 12)
        recs.append(Recommendation(
            category="OVERLAP",
            severity="HIGH" if worst.overlap_pct >= 40 else "MEDIUM",
            title=f"{len(overlaps)} fund overlap(s) detected",
            description=f"Your funds '{worst.fund_a}' and '{worst.fund_b}' share {worst.overlap_pct}% of the same stocks ({', '.join(worst.common_stocks[:3])}…). This hidden duplication means you're less diversified than you think.",
            action="Consolidate overlapping funds",
        ))

    # ── Concentration Risk ─────────────────────────────────────────
    conc_flags = analytics.compute_concentration_flags(holdings, total_value)
    high_conc = [f for f in conc_flags if f.level == "HIGH"]
    if high_conc:
        health_score -= len(high_conc) * 5
        recs.append(Recommendation(
            category="RISK",
            severity="HIGH",
            title="High concentration risk",
            description=high_conc[0].message + " Consider spreading your investments across more holdings to reduce single-point-of-failure risk.",
            action="Spread your bets",
        ))

    # ── Goal-based Recommendations ─────────────────────────────────
    if not goals:
        recs.append(Recommendation(
            category="GOAL",
            severity="LOW",
            title="No financial goals set",
            description="Setting clear goals (retirement, home, education) helps you invest with purpose. Goal-based planning ensures you know exactly how much to save each month.",
            action="Create your first goal",
        ))
    else:
        for goal in goals:
            months_left = max(0, (goal.target_date.year - datetime.utcnow().year) * 12
                              + (goal.target_date.month - datetime.utcnow().month))
            # Estimate current value (proportional share)
            goal_count = len(goals)
            current_for_goal = total_value / goal_count if goal_count > 0 else 0
            progress = (current_for_goal / goal.target_amount * 100) if goal.target_amount > 0 else 0

            if progress < 30 and months_left < 60:
                health_score -= 5
                recs.append(Recommendation(
                    category="GOAL",
                    severity="HIGH",
                    title=f"'{goal.name}' is behind schedule",
                    description=f"You're only {progress:.0f}% toward your ₹{goal.target_amount:,.0f} target with {months_left} months left. You'll need to significantly increase your monthly SIP to stay on track.",
                    action=f"Boost SIP for {goal.name}",
                ))
            elif progress < 50 and months_left < 120:
                recs.append(Recommendation(
                    category="GOAL",
                    severity="MEDIUM",
                    title=f"'{goal.name}' needs attention",
                    description=f"At {progress:.0f}% progress with {months_left} months remaining, a small increase in your monthly contribution can make a big difference over time.",
                    action=f"Review {goal.name} SIP",
                ))

    # ── SIP Optimization ───────────────────────────────────────────
    if total_invested > 0 and total_value > 0:
        returns_pct = ((total_value - total_invested) / total_invested) * 100
        if returns_pct < 8 and total_invested > 100000:
            recs.append(Recommendation(
                category="SIP",
                severity="MEDIUM",
                title="Portfolio returns below benchmark",
                description=f"Your overall returns are {returns_pct:.1f}%, which is below the typical 10-12% expected from a diversified equity-debt portfolio. Consider reviewing underperforming funds.",
                action="Review fund performance",
            ))

        # Check for underperformers
        for h in holdings:
            if h.invested_value > 0:
                h_return = ((h.current_value - h.invested_value) / h.invested_value) * 100
                if h_return < -5 and h.current_value > total_value * 0.05:
                    recs.append(Recommendation(
                        category="SIP",
                        severity="MEDIUM",
                        title=f"{h.name} is underperforming",
                        description=f"This holding has returned {h_return:.1f}% on ₹{h.invested_value:,.0f} invested. If fundamentals haven't changed, consider switching your SIP to a better-performing alternative.",
                        action="Switch or stop SIP",
                    ))
                    break  # Only flag the worst one

    # ── Emergency Fund ─────────────────────────────────────────────
    cash_weight = next((s.weight_pct for s in allocation if s.asset_class == "CASH"), 0.0)
    debt_total = sum(s.current_value for s in allocation if s.asset_class in ("DEBT", "CASH"))
    if cash_weight < 5 and debt_total < total_value * 0.1 and total_value > 100000:
        recs.append(Recommendation(
            category="RISK",
            severity="LOW",
            title="Consider building an emergency fund",
            description="Less than 10% of your portfolio is in liquid/debt instruments. Financial experts recommend keeping 3-6 months of expenses in easily accessible funds before aggressive investing.",
            action="Add liquid funds",
        ))

    # Clamp health score
    health_score = max(0, min(100, health_score))

    # Sort by severity
    severity_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    recs.sort(key=lambda r: severity_order.get(r.severity, 99))

    return RecommendationsOut(recommendations=recs, score=health_score)


@router.get("/recommendations/{user_id}", response_model=RecommendationsOut)
def get_recommendations(user_id: int, db: Session = Depends(get_db)):
    """
    Generate personalized, actionable recommendations based on the user's
    consolidated portfolio, risk profile, and goals.
    """
    return _generate_recommendations(db, user_id)
