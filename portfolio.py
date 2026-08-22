from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import ConsolidatedPortfolioOut, RiskInsightsOut
from app.services import consolidation, analytics

router = APIRouter()


@router.get("/portfolio/{user_id}/consolidated", response_model=ConsolidatedPortfolioOut)
def get_consolidated_portfolio(user_id: int, db: Session = Depends(get_db)):
    """
    The core "portfolio consolidation" endpoint: every holding across every
    linked platform, rolled into one net worth number, one asset allocation,
    and one money-weighted (XIRR) return.
    """
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    return consolidation.build_consolidated_portfolio(db, user_id)


@router.get("/portfolio/{user_id}/risk-insights", response_model=RiskInsightsOut)
def get_risk_insights(user_id: int, db: Session = Depends(get_db)):
    """
    The "why does this matter" layer: fund overlap across platforms,
    concentration flags, and a plain-English verdict on whether the
    consolidated allocation matches the user's stated risk profile.
    """
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(404, "User not found")

    holdings = consolidation.get_all_holdings(db, user_id)
    total_value = sum(h.current_value for h in holdings)

    overlaps = analytics.compute_fund_overlaps(holdings)
    flags = analytics.compute_concentration_flags(holdings, total_value)
    allocation = analytics.compute_asset_allocation(holdings)
    score = analytics.diversification_score(holdings, overlaps, total_value)
    verdict = analytics.risk_profile_verdict(allocation, user.risk_profile)

    return RiskInsightsOut(
        diversification_score=score,
        fund_overlaps=overlaps,
        concentration_flags=flags,
        asset_allocation_vs_risk_profile=verdict,
    )
