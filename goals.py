from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Goal, Holding, LinkedAccount
from app.schemas import GoalCreate, GoalOut

router = APIRouter()


def _compute_monthly_sip(target: float, current: float, months_left: int, annual_return: float = 0.12) -> float:
    """Estimate monthly SIP needed to reach target assuming a given annual return."""
    if months_left <= 0:
        return 0.0
    gap = target - current
    if gap <= 0:
        return 0.0
    r = annual_return / 12
    # Future value of annuity formula: FV = SIP * [((1+r)^n - 1) / r]
    factor = ((1 + r) ** months_left - 1) / r
    return round(gap / factor, 2) if factor > 0 else 0.0


@router.post("/goals", response_model=GoalOut)
def create_goal(payload: GoalCreate, db: Session = Depends(get_db)):
    user = db.query(User).get(payload.user_id)
    if not user:
        raise HTTPException(404, "User not found")
    goal = Goal(
        user_id=payload.user_id,
        name=payload.name,
        target_amount=payload.target_amount,
        target_date=datetime.fromisoformat(payload.target_date),
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _enrich_goal(db, goal)


@router.get("/goals/{user_id}", response_model=list[GoalOut])
def list_goals(user_id: int, db: Session = Depends(get_db)):
    goals = db.query(Goal).filter(Goal.user_id == user_id).all()
    return [_enrich_goal(db, g) for g in goals]


@router.delete("/goals/{goal_id}")
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    goal = db.query(Goal).get(goal_id)
    if not goal:
        raise HTTPException(404, "Goal not found")
    db.delete(goal)
    db.commit()
    return {"status": "deleted", "goal_id": goal_id}


def _enrich_goal(db: Session, goal: Goal) -> GoalOut:
    """Compute current progress toward the goal."""
    # Sum the current value of all holdings tagged to this goal
    tagged_holdings = db.query(Holding).filter(Holding.goal_id == goal.id).all()
    current_value = sum(h.current_value for h in tagged_holdings)

    # If no holdings tagged, estimate based on proportional portfolio share
    if current_value == 0:
        all_accounts = (
            db.query(LinkedAccount)
            .filter(LinkedAccount.user_id == goal.user_id, LinkedAccount.is_active.is_(True))
            .all()
        )
        total_portfolio = sum(h.current_value for acc in all_accounts for h in acc.holdings)
        # Count goals to split proportionally
        goal_count = db.query(Goal).filter(Goal.user_id == goal.user_id).count()
        if goal_count > 0 and total_portfolio > 0:
            current_value = round(total_portfolio / goal_count, 2)

    progress = round(100 * current_value / goal.target_amount, 1) if goal.target_amount > 0 else 0.0
    months_left = max(0, (goal.target_date.year - datetime.utcnow().year) * 12
                      + (goal.target_date.month - datetime.utcnow().month))
    sip = _compute_monthly_sip(goal.target_amount, current_value, months_left)

    out = GoalOut.model_validate(goal)
    out.current_value = current_value
    out.progress_pct = min(progress, 100.0)
    out.monthly_sip_needed = sip
    return out
