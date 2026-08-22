"""
The "make it mean something" layer. Pure functions over ORM objects so they
are easy to unit test independently of FastAPI/DB wiring.
"""
from collections import defaultdict
from datetime import datetime
from typing import List, Dict, Optional
from itertools import combinations

from scipy.optimize import brentq

from app.models import Holding, LinkedAccount
from app.schemas import (
    AssetAllocationSlice, HoldingOut, OverlapPair, ConcentrationFlag,
)


# ---------------------------------------------------------------------------
# XIRR — money-weighted return, correct for irregular SIP cash flows.
# ---------------------------------------------------------------------------

def _xnpv(rate: float, cashflows: List[tuple]) -> float:
    """cashflows: list of (datetime, amount)."""
    t0 = cashflows[0][0]
    return sum(cf / (1 + rate) ** ((t - t0).days / 365.0) for t, cf in cashflows)


def compute_xirr(cashflows: List[tuple]) -> Optional[float]:
    """
    cashflows: list of (date, amount) with outflows negative (money invested)
    and the final inflow being current market value (positive), on "today".
    Returns annualized % return, or None if it can't be solved (e.g. all
    cashflows same sign, or fewer than 2 points).
    """
    if len(cashflows) < 2:
        return None
    amounts = [cf for _, cf in cashflows]
    if not (min(amounts) < 0 < max(amounts)):
        return None  # XIRR undefined without at least one in- and one out-flow
    try:
        rate = brentq(lambda r: _xnpv(r, cashflows), -0.9999, 10)
        return round(rate * 100, 2)
    except ValueError:
        return None


def portfolio_xirr(holdings: List[Holding]) -> Optional[float]:
    """
    Builds one combined cashflow series across every holding's transaction
    history plus a single final inflow = today's total current value. This
    is the correct way to compute a *consolidated* XIRR rather than
    averaging each holding's individual XIRR (which double-counts weight
    incorrectly).
    """
    cashflows = []
    total_current_value = 0.0
    for h in holdings:
        total_current_value += h.current_value
        for txn in h.transactions:
            cashflows.append((txn.txn_date, txn.amount))

    if not cashflows:
        return None
    cashflows.append((datetime.utcnow(), total_current_value))
    cashflows.sort(key=lambda x: x[0])
    return compute_xirr(cashflows)


# ---------------------------------------------------------------------------
# Asset allocation — rolled up across every linked platform.
# ---------------------------------------------------------------------------

def compute_asset_allocation(holdings: List[Holding]) -> List[AssetAllocationSlice]:
    buckets: Dict[str, Dict[str, float]] = defaultdict(lambda: {"invested": 0.0, "current": 0.0})
    total_current = sum(h.current_value for h in holdings) or 1.0

    for h in holdings:
        key = h.asset_class.value if hasattr(h.asset_class, "value") else h.asset_class
        buckets[key]["invested"] += h.invested_value
        buckets[key]["current"] += h.current_value

    slices = []
    for asset_class, vals in sorted(buckets.items(), key=lambda kv: -kv[1]["current"]):
        slices.append(AssetAllocationSlice(
            asset_class=asset_class,
            invested_value=round(vals["invested"], 2),
            current_value=round(vals["current"], 2),
            weight_pct=round(100 * vals["current"] / total_current, 2),
        ))
    return slices


def holdings_by_platform(accounts: List[LinkedAccount]) -> Dict[str, float]:
    out: Dict[str, float] = defaultdict(float)
    for acc in accounts:
        out[acc.provider_name] += sum(h.current_value for h in acc.holdings)
    return {k: round(v, 2) for k, v in out.items()}


# ---------------------------------------------------------------------------
# Fund overlap — the "you think you're diversified but you're not" check.
# ---------------------------------------------------------------------------

def compute_fund_overlaps(holdings: List[Holding], min_overlap_pct: float = 15.0) -> List[OverlapPair]:
    """
    Jaccard-style overlap on each mutual fund's disclosed top-stock holdings.
    A production version would use full portfolio disclosure (all stocks +
    weights) fetched via AMFI/fund-fact-sheet APIs; top-N is a reasonable
    proxy for an MVP and is directionally correct for flagging real overlap.
    """
    funds = [h for h in holdings if h.holding_type.value == "MUTUAL_FUND" and h.top_stocks]
    pairs = []
    for a, b in combinations(funds, 2):
        stocks_a = set(s.strip() for s in a.top_stocks.split(",") if s.strip())
        stocks_b = set(s.strip() for s in b.top_stocks.split(",") if s.strip())
        if not stocks_a or not stocks_b:
            continue
        common = stocks_a & stocks_b
        union = stocks_a | stocks_b
        overlap_pct = round(100 * len(common) / len(union), 1) if union else 0.0
        if overlap_pct >= min_overlap_pct and common:
            pairs.append(OverlapPair(
                fund_a=a.name, fund_b=b.name,
                overlap_pct=overlap_pct, common_stocks=sorted(common),
            ))
    return sorted(pairs, key=lambda p: -p.overlap_pct)


# ---------------------------------------------------------------------------
# Concentration & risk flags — plain-English nudges, not just numbers.
# ---------------------------------------------------------------------------

RISK_PROFILE_EQUITY_BAND = {
    "CONSERVATIVE": (0, 35),
    "MODERATE": (35, 65),
    "AGGRESSIVE": (65, 100),
}


def compute_concentration_flags(holdings: List[Holding], total_value: float) -> List[ConcentrationFlag]:
    flags: List[ConcentrationFlag] = []
    if total_value <= 0:
        return flags

    # Single-holding concentration
    for h in holdings:
        weight = 100 * h.current_value / total_value
        if weight >= 25:
            flags.append(ConcentrationFlag(
                level="HIGH",
                message=f"{h.name} alone makes up {weight:.1f}% of your portfolio — "
                        f"a sharp move in this single holding will swing your whole net worth.",
            ))
        elif weight >= 15:
            flags.append(ConcentrationFlag(
                level="WARN",
                message=f"{h.name} is {weight:.1f}% of your portfolio — worth watching as a concentration risk.",
            ))

    # Platform concentration (e.g. everything with one broker/AMC — operational risk)
    provider_totals: Dict[str, float] = defaultdict(float)
    for h in holdings:
        provider_totals[h.account.provider_name] += h.current_value
    for provider, value in provider_totals.items():
        weight = 100 * value / total_value
        if weight >= 70 and len(provider_totals) > 1:
            flags.append(ConcentrationFlag(
                level="INFO",
                message=f"{weight:.0f}% of your money sits with {provider}. Not necessarily a problem, "
                        f"but consider whether you're diversified across platforms too.",
            ))
    return flags


def diversification_score(holdings: List[Holding], overlaps: List[OverlapPair], total_value: float) -> float:
    """
    0-100 heuristic: starts at 100, penalized by (a) single-holding
    concentration beyond a healthy weight and (b) meaningful fund overlap.
    Simple and explainable beats a black-box score for a first-time investor.
    """
    if total_value <= 0 or not holdings:
        return 0.0
    score = 100.0
    for h in holdings:
        weight = 100 * h.current_value / total_value
        if weight > 10:
            score -= min(weight - 10, 25) * 0.6
    for pair in overlaps:
        score -= min(pair.overlap_pct * 0.15, 10)
    return round(max(0.0, min(100.0, score)), 1)


def risk_profile_verdict(allocation: List[AssetAllocationSlice], risk_profile: str) -> str:
    equity_weight = next((s.weight_pct for s in allocation if s.asset_class == "EQUITY"), 0.0)
    lo, hi = RISK_PROFILE_EQUITY_BAND.get(risk_profile, (35, 65))
    if equity_weight < lo:
        return (f"Your equity allocation ({equity_weight:.0f}%) is lower than typical for a "
                f"{risk_profile.title()} profile ({lo}-{hi}%) — you may be leaving long-term "
                f"growth on the table.")
    if equity_weight > hi:
        return (f"Your equity allocation ({equity_weight:.0f}%) is higher than typical for a "
                f"{risk_profile.title()} profile ({lo}-{hi}%) — make sure that matches your "
                f"actual risk tolerance and time horizon, not just recent market hype.")
    return (f"Your equity allocation ({equity_weight:.0f}%) is well within the expected "
            f"{lo}-{hi}% band for a {risk_profile.title()} profile.")


def to_holding_out(h: Holding) -> HoldingOut:
    gain = h.current_value - h.invested_value
    gain_pct = round(100 * gain / h.invested_value, 2) if h.invested_value else 0.0
    return HoldingOut(
        id=h.id, holding_type=h.holding_type, asset_class=h.asset_class,
        name=h.name, identifier=h.identifier, units=h.units,
        avg_cost_price=h.avg_cost_price, current_price=h.current_price,
        invested_value=h.invested_value, current_value=h.current_value,
        gain_loss=round(gain, 2), gain_loss_pct=gain_pct,
        source_provider=h.account.provider_name,
    )
