from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, LinkedAccount
from app.schemas import LinkAccountRequest, LinkedAccountOut, UserCreate, UserOut, GoogleLoginRequest
from app.services import consolidation
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

GOOGLE_CLIENT_ID = "289964824699-i6gpr4f3nh37csqkhg8p49jarevkcpvc.apps.googleusercontent.com"

router = APIRouter()


@router.post("/users", response_model=UserOut)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(400, "User with this email already exists")
    user = User(name=payload.name, email=payload.email, risk_profile=payload.risk_profile)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/auth/google", response_model=UserOut)
def google_login(payload: GoogleLoginRequest, db: Session = Depends(get_db)):
    try:
        idinfo = id_token.verify_oauth2_token(
            payload.token, google_requests.Request(), GOOGLE_CLIENT_ID
        )
        email = idinfo.get("email")
        name = idinfo.get("name", email)
        if not email:
            raise HTTPException(400, "Invalid token: No email found")
            
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(name=name, email=email, risk_profile=payload.risk_profile)
            db.add(user)
            db.commit()
            db.refresh(user)
        return user
    except ValueError:
        raise HTTPException(400, "Invalid Google token")


@router.post("/accounts/link", response_model=LinkedAccountOut)
def link_account(payload: LinkAccountRequest, db: Session = Depends(get_db)):
    """
    Link a new source of holdings.

    - source_type=ACCOUNT_AGGREGATOR: `consent_or_file_ref` is the consent
      handle your AA-Gateway SDK returns after the user approves consent in
      their AA app.
    - source_type=CAS_UPLOAD: `consent_or_file_ref` is a reference to the
      already-uploaded CAS PDF (the parsing step happens before this call in
      a real system; here it's simulated).
    """
    user = db.query(User).get(payload.user_id)
    if not user:
        raise HTTPException(404, "User not found")

    seed = payload.consent_or_file_ref or f"{payload.user_id}-{payload.provider_name}"
    account = consolidation.link_and_sync_account(
        db, user_id=payload.user_id, source_type=payload.source_type,
        provider_name=payload.provider_name, account_ref_seed=seed,
    )
    out = LinkedAccountOut.model_validate(account)
    out.holdings_count = len(account.holdings)
    return out


@router.get("/accounts/{user_id}", response_model=list[LinkedAccountOut])
def list_accounts(user_id: int, db: Session = Depends(get_db)):
    accounts = db.query(LinkedAccount).filter(LinkedAccount.user_id == user_id).all()
    result = []
    for acc in accounts:
        out = LinkedAccountOut.model_validate(acc)
        out.holdings_count = len(acc.holdings)
        result.append(out)
    return result


@router.post("/accounts/{account_id}/resync", response_model=LinkedAccountOut)
def resync_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(LinkedAccount).get(account_id)
    if not account:
        raise HTTPException(404, "Linked account not found")
    consolidation.sync_account_holdings(db, account, account.consent_id or account.account_ref)
    db.commit()
    db.refresh(account)
    out = LinkedAccountOut.model_validate(account)
    out.holdings_count = len(account.holdings)
    return out


@router.delete("/accounts/{account_id}")
def unlink_account(account_id: int, db: Session = Depends(get_db)):
    """Revoke a source — mirrors AA consent revocation. Removes it from all
    consolidated views immediately; underlying investment is untouched."""
    account = db.query(LinkedAccount).get(account_id)
    if not account:
        raise HTTPException(404, "Linked account not found")
    account.is_active = False
    db.commit()
    return {"status": "unlinked", "account_id": account_id}
