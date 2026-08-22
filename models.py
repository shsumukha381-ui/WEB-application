"""
Core schema.

Everything a user owns, regardless of which app/broker/AMC it actually lives
in, gets normalized into a `Holding` row hanging off a `LinkedAccount`. This
is the whole point of consolidation: the analytics layer never needs to know
whether a holding came from Zerodha, Groww, or a CAS PDF.
"""
from datetime import datetime
# pyrefly: ignore [missing-import]
from sqlalchemy import (
    Column, Integer, String, Float, DateTime, ForeignKey, Enum, Boolean, Text
)
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import relationship
import enum

from app.database import Base


class AssetClass(str, enum.Enum):
    EQUITY = "EQUITY"
    DEBT = "DEBT"
    HYBRID = "HYBRID"
    GOLD = "GOLD"
    CASH = "CASH"
    REAL_ESTATE = "REAL_ESTATE"
    OTHER = "OTHER"


class HoldingType(str, enum.Enum):
    MUTUAL_FUND = "MUTUAL_FUND"
    STOCK = "STOCK"
    EPF = "EPF"
    FIXED_DEPOSIT = "FIXED_DEPOSIT"
    NPS = "NPS"
    BOND = "BOND"
    SGB = "SGB"  # Sovereign Gold Bond


class SourceType(str, enum.Enum):
    ACCOUNT_AGGREGATOR = "ACCOUNT_AGGREGATOR"
    CAS_UPLOAD = "CAS_UPLOAD"
    MANUAL = "MANUAL"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    risk_profile = Column(String, default="MODERATE")  # CONSERVATIVE/MODERATE/AGGRESSIVE
    created_at = Column(DateTime, default=datetime.utcnow)

    accounts = relationship("LinkedAccount", back_populates="user", cascade="all, delete-orphan")
    goals = relationship("Goal", back_populates="user", cascade="all, delete-orphan")


class LinkedAccount(Base):
    """
    One connected source: a demat account via AA, a CAS PDF import, an EPF
    UAN, etc. This is the unit consent/removal operates on — a user can
    unlink one platform without touching the rest of their consolidated view.
    """
    __tablename__ = "linked_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    source_type = Column(Enum(SourceType), nullable=False)
    provider_name = Column(String, nullable=False)  # e.g. "Zerodha", "Groww", "NSDL-CAS"
    account_ref = Column(String, nullable=True)  # masked account/folio number
    consent_id = Column(String, nullable=True)  # AA consent artefact id, if applicable
    consent_expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    linked_at = Column(DateTime, default=datetime.utcnow)
    last_synced_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="accounts")
    holdings = relationship("Holding", back_populates="account", cascade="all, delete-orphan")


class Holding(Base):
    """A single normalized position, regardless of origin platform."""
    __tablename__ = "holdings"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("linked_accounts.id"), nullable=False)

    holding_type = Column(Enum(HoldingType), nullable=False)
    asset_class = Column(Enum(AssetClass), nullable=False)
    name = Column(String, nullable=False)  # scheme/stock/instrument name
    identifier = Column(String, nullable=True)  # ISIN / AMFI scheme code / ticker

    units = Column(Float, default=0.0)
    avg_cost_price = Column(Float, default=0.0)
    current_price = Column(Float, default=0.0)
    invested_value = Column(Float, default=0.0)
    current_value = Column(Float, default=0.0)

    # For mutual funds: helps overlap/sector analysis without needing a
    # separate holdings-of-holdings table for this MVP.
    top_sectors = Column(Text, nullable=True)  # comma-separated
    top_stocks = Column(Text, nullable=True)   # comma-separated ISINs/names

    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=True)

    account = relationship("LinkedAccount", back_populates="holdings")
    transactions = relationship("Transaction", back_populates="holding", cascade="all, delete-orphan")


class Transaction(Base):
    """
    Cash-flow ledger per holding — required to compute XIRR properly for
    SIPs (irregular, recurring investments) rather than a single lump CAGR.
    """
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    holding_id = Column(Integer, ForeignKey("holdings.id"), nullable=False)
    txn_date = Column(DateTime, nullable=False)
    txn_type = Column(String, nullable=False)  # BUY / SELL / SIP / DIVIDEND
    amount = Column(Float, nullable=False)  # negative for outflow (buy), positive for inflow (sell/dividend)
    units = Column(Float, nullable=True)

    holding = relationship("Holding", back_populates="transactions")


class Goal(Base):
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)  # e.g. "Retirement", "Home down payment"
    target_amount = Column(Float, nullable=False)
    target_date = Column(DateTime, nullable=False)

    user = relationship("User", back_populates="goals")
