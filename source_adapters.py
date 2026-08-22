"""
Ingestion layer.

Every place a user's money lives is a "source". In production, two sources
dominate the Indian market:

  1. Account Aggregator (AA) — consent-based, real-time, ReBIT-JSON. Requires
     partnering with a licensed AA-Gateway (a full RBI FIU license is rarely
     practical for an early-stage product) since the FIU must itself be
     regulated by RBI/SEBI/IRDAI/PFRDA.
  2. CAS (Consolidated Account Statement) PDF from NSDL/CDSL/CAMS/KFintech —
     user-initiated upload/email-forward, parsed into structured JSON by a
     parser service (e.g. CASParser), covers demat + mutual fund folios not
     covered by AA today.

Both are modeled here as `SourceAdapter` implementations so `consolidation.py`
never has to know or care which pipe the data came through. Swap the mock
`fetch_holdings()` bodies below for real HTTP calls to your AA-Gateway SDK /
CAS-parser API and nothing downstream changes.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import List, Optional
import random

from app.models import AssetClass, HoldingType


@dataclass
class RawHolding:
    """What every adapter must produce, before it's persisted as a Holding row."""
    holding_type: HoldingType
    asset_class: AssetClass
    name: str
    identifier: Optional[str]
    units: float
    avg_cost_price: float
    current_price: float
    top_sectors: List[str] = field(default_factory=list)
    top_stocks: List[str] = field(default_factory=list)
    # (date, txn_type, amount, units) — amount negative = outflow (buy/SIP)
    transactions: List[tuple] = field(default_factory=list)

    @property
    def invested_value(self) -> float:
        return round(self.units * self.avg_cost_price, 2)

    @property
    def current_value(self) -> float:
        return round(self.units * self.current_price, 2)


class SourceAdapter(ABC):
    """Interface every data source (AA, CAS, manual entry, future EPF/NPS) implements."""

    provider_name: str

    @abstractmethod
    def fetch_holdings(self, account_ref: str) -> List[RawHolding]:
        ...


class AccountAggregatorAdapter(SourceAdapter):
    """
    Real implementation would:
      1. Take the `consent_handle` returned once the user approves consent
         in their AA app (e.g. OneMoney, Finvu, CAMS Finserv Account Aggregator).
      2. Poll the AA-Gateway for the FI Data Session using the consent id.
      3. Decrypt the ReBIT-JSON payload (ECDH key exchange, per FIP).
      4. Map ReBIT's `EQUITIES`/`MUTUAL_FUNDS`/`DEPOSIT` schemas to RawHolding.

    Mocked here with representative sample data so the API is runnable
    end-to-end without live AA credentials.
    """
    provider_name = "Account Aggregator"

    SAMPLE_FUNDS = [
        ("Parag Parikh Flexi Cap Fund", "INF879O01019", AssetClass.EQUITY,
         ["Financial Services", "Technology", "FMCG"], ["HDFC Bank", "Bajaj Holdings", "ITC"]),
        ("Mirae Asset Large Cap Fund", "INF769K01010", AssetClass.EQUITY,
         ["Financial Services", "Energy", "Technology"], ["ICICI Bank", "Reliance Industries", "Infosys"]),
        ("HDFC Corporate Bond Fund", "INF179K01AN0", AssetClass.DEBT,
         ["Government Securities", "AAA Corporate Bonds"], []),
        ("SBI Gold Fund", "INF200K01UY0", AssetClass.GOLD, ["Commodities"], []),
    ]

    def fetch_holdings(self, account_ref: str) -> List[RawHolding]:
        random.seed(account_ref)  # deterministic mock per account
        out = []
        for name, isin, asset_class, sectors, stocks in self.SAMPLE_FUNDS[:random.randint(2, 4)]:
            units = round(random.uniform(100, 900), 3)
            avg_cost = round(random.uniform(20, 60), 2)
            current = round(avg_cost * random.uniform(1.05, 1.45), 2)
            txns = self._synthetic_sip_history(units, avg_cost)
            out.append(RawHolding(
                holding_type=HoldingType.MUTUAL_FUND,
                asset_class=asset_class,
                name=name,
                identifier=isin,
                units=units,
                avg_cost_price=avg_cost,
                current_price=current,
                top_sectors=sectors,
                top_stocks=stocks,
                transactions=txns,
            ))
        return out

    @staticmethod
    def _synthetic_sip_history(total_units: float, avg_cost: float, months: int = 12) -> List[tuple]:
        per_month_units = total_units / months
        txns = []
        today = datetime.utcnow()
        for i in range(months):
            d = today - timedelta(days=30 * (months - i))
            amount = -round(per_month_units * avg_cost, 2)  # outflow
            txns.append((d, "SIP", amount, per_month_units))
        return txns


class CASUploadAdapter(SourceAdapter):
    """
    Real implementation would call a CAS-parsing service with the uploaded
    PDF (NSDL/CDSL/CAMS/KFintech format) + the CAS password, and receive back
    structured folio/ISIN-level holdings. Mocked here with sample demat data.
    """
    provider_name = "CAS (NSDL/CDSL/CAMS)"

    SAMPLE_STOCKS = [
        ("Tata Consultancy Services", "INE467B01029"),
        ("HDFC Bank", "INE040A01034"),
        ("Reliance Industries", "INE002A01018"),
        ("Infosys", "INE009A01021"),
    ]

    def fetch_holdings(self, account_ref: str) -> List[RawHolding]:
        random.seed(account_ref + "_cas")
        out = []
        for name, isin in self.SAMPLE_STOCKS[:random.randint(2, 4)]:
            units = float(random.randint(5, 60))
            avg_cost = round(random.uniform(500, 3500), 2)
            current = round(avg_cost * random.uniform(0.85, 1.6), 2)
            out.append(RawHolding(
                holding_type=HoldingType.STOCK,
                asset_class=AssetClass.EQUITY,
                name=name,
                identifier=isin,
                units=units,
                avg_cost_price=avg_cost,
                current_price=current,
                transactions=[(datetime.utcnow() - timedelta(days=400), "BUY",
                                -round(units * avg_cost, 2), units)],
            ))
        return out


def get_adapter(source_type: str) -> SourceAdapter:
    from app.models import SourceType
    mapping = {
        SourceType.ACCOUNT_AGGREGATOR.value: AccountAggregatorAdapter(),
        SourceType.CAS_UPLOAD.value: CASUploadAdapter(),
    }
    adapter = mapping.get(source_type)
    if not adapter:
        raise ValueError(f"No adapter registered for source_type={source_type}")
    return adapter
