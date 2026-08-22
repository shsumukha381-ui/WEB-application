from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, ConfigDict

from app.models import AssetClass, HoldingType, SourceType


# ---------- Users ----------

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    risk_profile: Optional[str] = "MODERATE"


class GoogleLoginRequest(BaseModel):
    token: str
    risk_profile: Optional[str] = "MODERATE"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: str
    risk_profile: str


# ---------- Linking accounts ----------

class LinkAccountRequest(BaseModel):
    user_id: int
    source_type: SourceType
    provider_name: str
    # For AA: consent handle returned after the user approves consent in the AA app.
    # For CAS: base64 or a pre-uploaded file reference (kept as a string id for this MVP).
    consent_or_file_ref: Optional[str] = None


class LinkedAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    source_type: SourceType
    provider_name: str
    account_ref: Optional[str]
    is_active: bool
    linked_at: datetime
    last_synced_at: Optional[datetime]
    holdings_count: int = 0


# ---------- Holdings ----------

class HoldingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    holding_type: HoldingType
    asset_class: AssetClass
    name: str
    identifier: Optional[str]
    units: float
    avg_cost_price: float
    current_price: float
    invested_value: float
    current_value: float
    gain_loss: float = 0.0
    gain_loss_pct: float = 0.0
    source_provider: Optional[str] = None


# ---------- Consolidated portfolio ----------

class AssetAllocationSlice(BaseModel):
    asset_class: str
    invested_value: float
    current_value: float
    weight_pct: float


class ConsolidatedPortfolioOut(BaseModel):
    total_invested: float
    total_current_value: float
    absolute_gain: float
    absolute_gain_pct: float
    xirr_pct: Optional[float]
    asset_allocation: List[AssetAllocationSlice]
    holdings_by_platform: dict  # provider_name -> current_value
    holdings: List[HoldingOut]


class OverlapPair(BaseModel):
    fund_a: str
    fund_b: str
    overlap_pct: float
    common_stocks: List[str]


class ConcentrationFlag(BaseModel):
    level: str  # "INFO" | "WARN" | "HIGH"
    message: str


class RiskInsightsOut(BaseModel):
    diversification_score: float  # 0-100, higher = better diversified
    fund_overlaps: List[OverlapPair]
    concentration_flags: List[ConcentrationFlag]
    asset_allocation_vs_risk_profile: str  # plain-English verdict


# ---------- Goals ----------

class GoalCreate(BaseModel):
    user_id: int
    name: str
    target_amount: float
    target_date: str  # ISO date string e.g. "2035-01-01"


class GoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    name: str
    target_amount: float
    target_date: datetime
    current_value: float = 0.0
    progress_pct: float = 0.0
    monthly_sip_needed: float = 0.0


# ---------- Recommendations ----------

class Recommendation(BaseModel):
    category: str  # "REBALANCE" | "DIVERSIFY" | "RISK" | "GOAL" | "SIP" | "OVERLAP"
    severity: str  # "HIGH" | "MEDIUM" | "LOW"
    title: str
    description: str
    action: str  # short CTA text


class RecommendationsOut(BaseModel):
    recommendations: List[Recommendation]
    score: int  # overall financial health score 0-100

