from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import accounts, portfolio, goals, recommendations

Dev convenience: auto-create tables. Use Alembic migrations in production.
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="WealthOne — Portfolio Consolidation API",
    description=(
        "Consolidates a user's investments across mutual fund apps, brokers/"
        "demat accounts, and CAS statements into one normalized portfolio, "
        "with XIRR, asset allocation, fund-overlap, and concentration-risk "
        "analytics."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[""],  # tighten to your frontend origin in production
    allow_methods=[""],
    allow_headers=["*"],
)

app.include_router(accounts.router, tags=["Accounts / Linking"])
app.include_router(portfolio.router, tags=["Consolidated Portfolio"])
app.include_router(goals.router, tags=["Goal-Based Planning"])
app.include_router(recommendations.router, tags=["Actionable Recommendations"])


@app.get("/health")
def health():
    return {"status": "ok"}
