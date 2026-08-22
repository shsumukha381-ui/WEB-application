"""
Real-time market data service.

Fetches live prices from Yahoo Finance for Indian stocks (NSE) and
mutual funds (BSE NAV). Uses an in-memory cache with a 5-minute TTL
to avoid hammering Yahoo on every request.

Gracefully falls back to stored/DB prices if Yahoo is unreachable
or a ticker is not mapped.
"""
import time
import logging
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────
# ISIN → Yahoo Finance ticker mapping
# Stocks: <ticker>.NS for NSE
# Mutual Funds: AMFI-based tickers on BSE (.BO) or direct scheme codes
# ──────────────────────────────────────────────────────────────────────

ISIN_TO_TICKER: Dict[str, str] = {
    # ── Indian Stocks (NSE) ───────────────────────────────────────────
    "INE467B01029": "TCS.NS",
    "INE040A01034": "HDFCBANK.NS",
    "INE002A01018": "RELIANCE.NS",
    "INE009A01021": "INFY.NS",

    # ── Mutual Funds (BSE / Yahoo) ────────────────────────────────────
    "INF879O01019": "0P0000XVAA.BO",   # Parag Parikh Flexi Cap
    "INF769K01010": "0P0000XVAB.BO",   # Mirae Asset Large Cap
    "INF179K01AN0": "0P00009VTB.BO",   # HDFC Corporate Bond
    "INF200K01UY0": "0P0000YK1T.BO",   # SBI Gold Fund
}

# Additional name-based fallback for tickers not found by ISIN
NAME_TO_TICKER: Dict[str, str] = {
    "Tata Consultancy Services": "TCS.NS",
    "HDFC Bank": "HDFCBANK.NS",
    "Reliance Industries": "RELIANCE.NS",
    "Infosys": "INFY.NS",
    "Parag Parikh Flexi Cap Fund": "0P0000XVAA.BO",
    "Mirae Asset Large Cap Fund": "0P0000XVAB.BO",
    "HDFC Corporate Bond Fund": "0P00009VTB.BO",
    "SBI Gold Fund": "0P0000YK1T.BO",
}

# ──────────────────────────────────────────────────────────────────────
# In-memory cache: { ticker: (price, timestamp) }
# ──────────────────────────────────────────────────────────────────────

_price_cache: Dict[str, tuple] = {}  # ticker → (price, epoch_time)
CACHE_TTL_SECONDS = 300  # 5 minutes


def _get_cached_price(ticker: str) -> Optional[float]:
    """Return cached price if still fresh, else None."""
    if ticker in _price_cache:
        price, ts = _price_cache[ticker]
        if time.time() - ts < CACHE_TTL_SECONDS:
            return price
    return None


def _set_cached_price(ticker: str, price: float) -> None:
    _price_cache[ticker] = (price, time.time())


def resolve_ticker(identifier: Optional[str], name: Optional[str] = None) -> Optional[str]:
    """Resolve an ISIN or holding name to a Yahoo Finance ticker."""
    if identifier and identifier in ISIN_TO_TICKER:
        return ISIN_TO_TICKER[identifier]
    if name and name in NAME_TO_TICKER:
        return NAME_TO_TICKER[name]
    return None


# ──────────────────────────────────────────────────────────────────────
# Bulk price fetcher — one yfinance call for all tickers
# ──────────────────────────────────────────────────────────────────────

def fetch_live_prices(tickers: List[str]) -> Dict[str, float]:
    """
    Fetch current market prices for a list of Yahoo Finance tickers.
    Returns { ticker: price } for tickers that were successfully fetched.
    Uses cache where available; only fetches stale/missing tickers from Yahoo.
    """
    result: Dict[str, float] = {}
    tickers_to_fetch: List[str] = []

    # Check cache first
    for ticker in tickers:
        cached = _get_cached_price(ticker)
        if cached is not None:
            result[ticker] = cached
        else:
            tickers_to_fetch.append(ticker)

    if not tickers_to_fetch:
        return result

    # Fetch from Yahoo Finance
    try:
        import yfinance as yf

        # yfinance's download() is efficient for bulk fetches
        tickers_str = " ".join(tickers_to_fetch)
        data = yf.download(
            tickers_str,
            period="1d",
            interval="1m",
            progress=False,
            threads=True,
        )

        if data.empty:
            logger.warning("yfinance returned empty data for: %s", tickers_str)
            return result

        # Single ticker vs multiple tickers have different DataFrame shapes
        if len(tickers_to_fetch) == 1:
            ticker = tickers_to_fetch[0]
            if "Close" in data.columns and not data["Close"].empty:
                price = float(data["Close"].dropna().iloc[-1])
                result[ticker] = round(price, 2)
                _set_cached_price(ticker, result[ticker])
        else:
            # Multi-ticker: columns are MultiIndex (Price, Ticker)
            if "Close" in data.columns.get_level_values(0):
                close_data = data["Close"]
                for ticker in tickers_to_fetch:
                    if ticker in close_data.columns:
                        series = close_data[ticker].dropna()
                        if not series.empty:
                            price = float(series.iloc[-1])
                            result[ticker] = round(price, 2)
                            _set_cached_price(ticker, result[ticker])

    except Exception as e:
        logger.error("Failed to fetch live prices from Yahoo Finance: %s", e)

    return result


def get_live_prices_for_holdings(holdings) -> Dict[int, Dict]:
    """
    Given a list of Holding ORM objects, resolve their tickers and fetch
    live prices. Returns { holding_id: { "ticker": ..., "live_price": ..., "stored_price": ... } }
    where stored_price is the DB price (for comparison/flash animation).
    """
    # Build ticker map: holding_id → ticker
    holding_ticker_map: Dict[int, str] = {}
    for h in holdings:
        ticker = resolve_ticker(h.identifier, h.name)
        if ticker:
            holding_ticker_map[h.id] = ticker

    if not holding_ticker_map:
        return {}

    # Fetch all unique tickers in one batch
    unique_tickers = list(set(holding_ticker_map.values()))
    live_prices = fetch_live_prices(unique_tickers)

    # Map back to holdings
    result: Dict[int, Dict] = {}
    for h in holdings:
        hid = h.id
        ticker = holding_ticker_map.get(hid)
        if ticker and ticker in live_prices:
            result[hid] = {
                "ticker": ticker,
                "live_price": live_prices[ticker],
                "stored_price": h.current_price,
            }

    return result


def update_holdings_with_live_prices(holdings) -> None:
    """
    Mutate Holding objects in-place with live market prices.
    Only updates current_price and current_value; does NOT persist to DB.
    This is applied on-the-fly when building the consolidated view.
    """
    price_map = get_live_prices_for_holdings(holdings)

    for h in holdings:
        if h.id in price_map:
            live_price = price_map[h.id]["live_price"]
            h.current_price = live_price
            h.current_value = round(h.units * live_price, 2)
