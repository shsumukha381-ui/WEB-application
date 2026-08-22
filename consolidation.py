"""
Orchestrates: link a source -> pull raw holdings via its adapter -> persist
normalized Holding/Transaction rows -> build the consolidated view on demand.
"""
from datetime import datetime
from typing import List
from sqlalchemy.orm import Session

from app.models import LinkedAccount, Holding, Transaction, SourceType
from app.services.source_adapters import get_adapter, RawHolding
from app.services import analytics
from app.schemas import ConsolidatedPortfolioOut


def link_and_sync_account(db: Session, user_id: int, source_type: SourceType,
                           provider_name: str, account_ref_seed: str) -> LinkedAccount:
    account = LinkedAccount(
        user_id=user_id,
        source_type=source_type,
        provider_name=provider_name,
        account_ref=f"XXXX{abs(hash(account_ref_seed)) % 10000:04d}",
        consent_id=f"consent-{abs(hash(account_ref_seed)) % 99999}" if source_type == SourceType.ACCOUNT_AGGREGATOR else None,
        is_active=True,
    )
    db.add(account)
    db.flush()  # get account.id without committing yet

    sync_account_holdings(db, account, account_ref_seed)
    db.commit()
    db.refresh(account)
    return account


def sync_account_holdings(db: Session, account: LinkedAccount, account_ref_seed: str) -> None:
    """Pull fresh holdings from the adapter and replace what we had stored."""
    adapter = get_adapter(account.source_type.value)
    raw_holdings: List[RawHolding] = adapter.fetch_holdings(account_ref_seed)

    # Clear previous snapshot for this account (simple full-refresh sync model;
    # a production system would diff and preserve holding ids across syncs).
    for h in list(account.holdings):
        db.delete(h)
    db.flush()

    for rh in raw_holdings:
        holding = Holding(
            account_id=account.id,
            holding_type=rh.holding_type,
            asset_class=rh.asset_class,
            name=rh.name,
            identifier=rh.identifier,
            units=rh.units,
            avg_cost_price=rh.avg_cost_price,
            current_price=rh.current_price,
            invested_value=rh.invested_value,
            current_value=rh.current_value,
            top_sectors=",".join(rh.top_sectors) if rh.top_sectors else None,
            top_stocks=",".join(rh.top_stocks) if rh.top_stocks else None,
        )
        db.add(holding)
        db.flush()  # get holding.id for transactions

        for (txn_date, txn_type, amount, units) in rh.transactions:
            db.add(Transaction(
                holding_id=holding.id, txn_date=txn_date, txn_type=txn_type,
                amount=amount, units=units,
            ))

    account.last_synced_at = datetime.utcnow()


def get_all_holdings(db: Session, user_id: int) -> List[Holding]:
    accounts = (
        db.query(LinkedAccount)
        .filter(LinkedAccount.user_id == user_id, LinkedAccount.is_active.is_(True))
        .all()
    )
    holdings: List[Holding] = []
    for acc in accounts:
        holdings.extend(acc.holdings)
    return holdings


def build_consolidated_portfolio(db: Session, user_id: int) -> ConsolidatedPortfolioOut:
    accounts = (
        db.query(LinkedAccount)
        .filter(LinkedAccount.user_id == user_id, LinkedAccount.is_active.is_(True))
        .all()
    )
    holdings: List[Holding] = [h for acc in accounts for h in acc.holdings]

    total_invested = sum(h.invested_value for h in holdings)
    total_current = sum(h.current_value for h in holdings)
    absolute_gain = total_current - total_invested
    absolute_gain_pct = round(100 * absolute_gain / total_invested, 2) if total_invested else 0.0

    return ConsolidatedPortfolioOut(
        total_invested=round(total_invested, 2),
        total_current_value=round(total_current, 2),
        absolute_gain=round(absolute_gain, 2),
        absolute_gain_pct=absolute_gain_pct,
        xirr_pct=analytics.portfolio_xirr(holdings),
        asset_allocation=analytics.compute_asset_allocation(holdings),
        holdings_by_platform=analytics.holdings_by_platform(accounts),
        holdings=[analytics.to_holding_out(h) for h in holdings],
    )
