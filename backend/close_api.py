"""
Close CRM REST API wrapper with in-memory caching and rate-limit handling.

Usage:
    api = CloseAPI(api_key="api_xxx")
    users = api.get_users()
    calls = api.get_calls("2026-01-01", "2026-02-01", user_id="user_xxx")
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Any, Dict, List, Optional, Tuple

import requests

from config import (
    CACHE_TTL_SECONDS,
    CLOSE_API_BASE,
    DEED_PURCHASED_STATUS_ID,
    MADE_CONTACT_OUTCOME_IDS,
    OUTCOME_LABEL_MAP,
    OUTCOME_NO_ANSWER_SMS,
    OUTCOME_OFFER_ACCEPTED,
    OUTCOME_OFFER_MADE,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _cache_key(method: str, args: Tuple, kwargs: Dict) -> str:
    """Build a deterministic cache key from method name and arguments."""
    raw = json.dumps({"m": method, "a": list(args), "k": kwargs}, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


# ---------------------------------------------------------------------------
# CloseAPI
# ---------------------------------------------------------------------------

class CloseAPI:
    """Thin wrapper around the Close CRM REST API (v1)."""

    MAX_PAGE_SIZE = 200
    MAX_RETRIES = 3
    RETRY_BACKOFF = 2  # seconds; doubles on each retry

    def __init__(self, api_key: str, cache_ttl: int = CACHE_TTL_SECONDS) -> None:
        self._session = requests.Session()
        self._session.auth = (api_key, "")
        self._session.headers.update({"Content-Type": "application/json"})
        self._cache: Dict[str, Tuple[float, Any]] = {}
        self._cache_ttl = cache_ttl

    # ------------------------------------------------------------------
    # Cache helpers
    # ------------------------------------------------------------------

    def _get_cached(self, key: str) -> Optional[Any]:
        if key in self._cache:
            ts, value = self._cache[key]
            if time.time() - ts < self._cache_ttl:
                return value
            del self._cache[key]
        return None

    def _set_cached(self, key: str, value: Any) -> None:
        self._cache[key] = (time.time(), value)

    def clear_cache(self) -> None:
        """Drop all cached responses so the next call hits the API."""
        self._cache.clear()

    # ------------------------------------------------------------------
    # Low-level request with retry on 429
    # ------------------------------------------------------------------

    def _request(self, method: str, path: str, params: Optional[Dict] = None,
                 json_body: Optional[Dict] = None) -> Dict:
        url = f"{CLOSE_API_BASE}/{path.lstrip('/')}"
        backoff = self.RETRY_BACKOFF
        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                resp = self._session.request(method, url, params=params, json=json_body,
                                             timeout=30)
            except requests.RequestException as exc:
                logger.warning("Request to %s failed (attempt %d): %s", url, attempt, exc)
                if attempt == self.MAX_RETRIES:
                    raise
                time.sleep(backoff)
                backoff *= 2
                continue

            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", backoff))
                logger.warning("Rate limited (429). Sleeping %ds (attempt %d/%d)",
                               retry_after, attempt, self.MAX_RETRIES)
                if attempt == self.MAX_RETRIES:
                    resp.raise_for_status()
                time.sleep(retry_after)
                backoff *= 2
                continue

            resp.raise_for_status()
            return resp.json()

        # Should not reach here, but just in case:
        raise RuntimeError(f"Failed to complete request to {url} after {self.MAX_RETRIES} attempts")

    # ------------------------------------------------------------------
    # Pagination helper
    # ------------------------------------------------------------------

    def _paginate(self, path: str, params: Optional[Dict] = None) -> List[Dict]:
        """Fetch all pages of a paginated Close endpoint and return combined data list."""
        params = dict(params or {})
        params.setdefault("_limit", self.MAX_PAGE_SIZE)
        params.setdefault("_skip", 0)

        results: List[Dict] = []
        while True:
            body = self._request("GET", path, params=params)
            data = body.get("data", [])
            results.extend(data)
            if not body.get("has_more", False):
                break
            params["_skip"] = params["_skip"] + len(data)
        return results

    # ------------------------------------------------------------------
    # Public API methods
    # ------------------------------------------------------------------

    def get_users(self) -> List[Dict]:
        """Return list of active Close user objects."""
        key = _cache_key("get_users", (), {})
        cached = self._get_cached(key)
        if cached is not None:
            return cached

        body = self._request("GET", "/user/")
        users = body.get("data", [])
        # Keep only active users; Close marks inactive with "inactive" status
        active = [u for u in users if u.get("status", "active") != "inactive"]
        self._set_cached(key, active)
        return active

    def get_calls(self, date_start: str, date_end: str,
                  user_id: Optional[str] = None) -> List[Dict]:
        """Return all call activity objects in [date_start, date_end).

        Parameters are ISO-8601 date strings (e.g. "2026-01-01").
        """
        key = _cache_key("get_calls", (date_start, date_end), {"user_id": user_id})
        cached = self._get_cached(key)
        if cached is not None:
            return cached

        params: Dict[str, Any] = {
            "date_created__gte": date_start,
            "date_created__lt": date_end,
            "_type": "Call",
        }
        if user_id:
            params["user_id"] = user_id

        calls = self._paginate("/activity/call/", params)
        self._set_cached(key, calls)
        return calls

    def get_emails_sent(self, date_start: str, date_end: str,
                        user_id: Optional[str] = None) -> List[Dict]:
        """Return outgoing manual email activity objects in [date_start, date_end)."""
        key = _cache_key("get_emails_sent", (date_start, date_end), {"user_id": user_id})
        cached = self._get_cached(key)
        if cached is not None:
            return cached

        params: Dict[str, Any] = {
            "date_created__gte": date_start,
            "date_created__lt": date_end,
            "_type": "Email",
        }
        if user_id:
            params["user_id"] = user_id

        all_emails = self._paginate("/activity/email/", params)
        # Only keep outgoing, manually-sent emails
        outgoing = [
            e for e in all_emails
            if e.get("direction") == "outgoing"
        ]
        self._set_cached(key, outgoing)
        return outgoing

    def get_opportunities_deed_purchased(
        self, date_start: Optional[str] = None, date_end: Optional[str] = None
    ) -> List[Dict]:
        """Return opportunities with 'Deed(s) Purchased' status, optionally filtered by date_won."""
        key = _cache_key("get_opportunities_deed_purchased", (), {
            "date_start": date_start, "date_end": date_end
        })
        cached = self._get_cached(key)
        if cached is not None:
            return cached

        params: Dict[str, Any] = {
            "status_id": DEED_PURCHASED_STATUS_ID,
        }
        if date_start:
            params["date_won__gte"] = date_start
        if date_end:
            params["date_won__lt"] = date_end

        opps = self._paginate("/opportunity/", params)
        self._set_cached(key, opps)
        return opps

    def get_calls_for_leads(self, lead_ids: List[str],
                            date_start: Optional[str] = None,
                            date_end: Optional[str] = None) -> List[Dict]:
        """Fetch calls associated with specific leads (best-effort, for avg talk time calc)."""
        if not lead_ids:
            return []

        key = _cache_key("get_calls_for_leads", (), {
            "lead_ids": sorted(lead_ids),
            "date_start": date_start,
            "date_end": date_end,
        })
        cached = self._get_cached(key)
        if cached is not None:
            return cached

        all_calls: List[Dict] = []
        for lid in lead_ids:
            params: Dict[str, Any] = {
                "lead_id": lid,
                "_type": "Call",
            }
            if date_start:
                params["date_created__gte"] = date_start
            if date_end:
                params["date_created__lt"] = date_end
            all_calls.extend(self._paginate("/activity/call/", params))

        self._set_cached(key, all_calls)
        return all_calls

    @staticmethod
    def get_call_outcomes() -> Dict[str, str]:
        """Return the known outcome_id -> label mapping (hardcoded from config)."""
        return dict(OUTCOME_LABEL_MAP)

    # ------------------------------------------------------------------
    # Call-outcome extraction helper
    # ------------------------------------------------------------------

    @staticmethod
    def extract_outcome_id(call: Dict) -> Optional[str]:
        """Extract the call outcome ID from a call activity object.

        Close may store the outcome in different field names depending on API version.
        We check the most likely fields in priority order.
        """
        for field in ("call_outcome_id", "outcome_id"):
            val = call.get(field)
            if val:
                return val

        # Fallback: check if a `disposition` string matches a known outcome label
        disposition = call.get("disposition", "")
        if disposition:
            label_to_id = {v.lower(): k for k, v in OUTCOME_LABEL_MAP.items()}
            match = label_to_id.get(disposition.lower())
            if match:
                return match

        return None
