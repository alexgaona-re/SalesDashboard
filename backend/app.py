"""
Flask application for the Close CRM KPI Dashboard.

Provides REST endpoints for sales metrics, leaderboard, agent configuration,
and user data sourced from the Close CRM API.
"""

from __future__ import annotations

import calendar
import json
import logging
import os
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

from close_api import CloseAPI
from config import (
    DEFAULT_COMMISSION_RATE,
    MADE_CONTACT_OUTCOME_IDS,
    OUTCOME_MADE_CONTACT,
    OUTCOME_NO_ANSWER_SMS,
    OUTCOME_NOT_INTERESTED,
    OUTCOME_OFFER_ACCEPTED,
    OUTCOME_OFFER_MADE,
)

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env", override=True)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

AGENT_CONFIG_PATH = Path(__file__).resolve().parent / "agent_config.json"

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-secret")
CORS(app)

api_key = os.getenv("CLOSE_API_KEY", "")
if not api_key:
    logger.warning("CLOSE_API_KEY not set -- API calls will fail")

close_api = CloseAPI(api_key=api_key)


# ---------------------------------------------------------------------------
# Agent config persistence helpers
# ---------------------------------------------------------------------------

def _load_agent_config() -> Dict[str, Dict[str, Any]]:
    """Load agent config from JSON file, creating it if it does not exist."""
    if AGENT_CONFIG_PATH.exists():
        try:
            with open(AGENT_CONFIG_PATH, "r") as fh:
                return json.load(fh)
        except (json.JSONDecodeError, IOError):
            logger.warning("Corrupt agent_config.json -- resetting")
    return {}


def _save_agent_config(configs: Dict[str, Dict[str, Any]]) -> None:
    with open(AGENT_CONFIG_PATH, "w") as fh:
        json.dump(configs, fh, indent=2)


def _ensure_agent_config_synced(users: List[Dict]) -> Dict[str, Dict[str, Any]]:
    """Ensure every active Close user has an entry in the agent config file.

    New users are auto-added with the default 15 % commission rate.
    Returns the (possibly updated) config dict.
    """
    configs = _load_agent_config()
    changed = False
    for user in users:
        uid = user.get("id", "")
        if uid and uid not in configs:
            configs[uid] = {
                "commission_rate": DEFAULT_COMMISSION_RATE,
                "name": f"{user.get('first_name', '')} {user.get('last_name', '')}".strip(),
            }
            changed = True
        elif uid and uid in configs:
            # Keep name in sync
            new_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
            if configs[uid].get("name") != new_name:
                configs[uid]["name"] = new_name
                changed = True
    if changed:
        _save_agent_config(configs)
    return configs


# ---------------------------------------------------------------------------
# Date-range helpers
# ---------------------------------------------------------------------------

def _parse_date(iso_str: Optional[str]) -> date:
    """Parse an ISO date string, defaulting to today."""
    if iso_str:
        try:
            return datetime.fromisoformat(iso_str).date()
        except ValueError:
            pass
    return date.today()


def _date_range_for_period(period: str, ref: date) -> Tuple[date, date, str]:
    """Return (start_inclusive, end_exclusive, human_label) for a period."""
    if period == "daily":
        start = ref
        end = ref + timedelta(days=1)
        label = ref.isoformat()
    elif period == "weekly":
        # Monday = 0
        start = ref - timedelta(days=ref.weekday())
        end = start + timedelta(days=7)
        label = f"Week of {start.isoformat()}"
    elif period == "monthly":
        start = ref.replace(day=1)
        last_day = calendar.monthrange(ref.year, ref.month)[1]
        end = start.replace(day=last_day) + timedelta(days=1)
        label = ref.strftime("%B %Y")
    elif period == "ytd":
        start = date(ref.year, 1, 1)
        end = ref + timedelta(days=1)
        label = f"YTD {ref.year}"
    else:
        # Default to daily
        start = ref
        end = ref + timedelta(days=1)
        label = ref.isoformat()
    return start, end, label


def _month_range(ref: date) -> Tuple[date, date]:
    """Return (first_of_month, first_of_next_month) for the month containing *ref*."""
    start = ref.replace(day=1)
    last_day = calendar.monthrange(ref.year, ref.month)[1]
    end = start.replace(day=last_day) + timedelta(days=1)
    return start, end


# ---------------------------------------------------------------------------
# Metrics calculation
# ---------------------------------------------------------------------------

def _safe_div(numerator: float, denominator: float, default: float = 0.0) -> float:
    """Division that returns *default* instead of raising on zero denominator."""
    if denominator == 0:
        return default
    return numerator / denominator


def _extract_outcome(call: Dict) -> Optional[str]:
    """Delegate to CloseAPI's static helper."""
    return CloseAPI.extract_outcome_id(call)


def _compute_activity(calls: List[Dict], emails: List[Dict]) -> Dict[str, Any]:
    """Compute the activity section of the metrics response."""
    outbound_calls = [c for c in calls if c.get("direction") == "outgoing"]
    total_calls = len(outbound_calls)

    sms_vm_sent = 0
    offers_made = 0
    offer_accepted = 0
    made_contact_count = 0
    not_interested_count = 0
    total_talk_time = 0

    for c in outbound_calls:
        oid = _extract_outcome(c)
        if oid == OUTCOME_NO_ANSWER_SMS:
            sms_vm_sent += 1
        if oid == OUTCOME_OFFER_MADE:
            offers_made += 1
        if oid == OUTCOME_OFFER_ACCEPTED:
            offer_accepted += 1
        if oid == OUTCOME_MADE_CONTACT:
            made_contact_count += 1
        if oid == OUTCOME_NOT_INTERESTED:
            not_interested_count += 1
        total_talk_time += c.get("duration", 0) or 0

    made_contact_total = made_contact_count + not_interested_count + offers_made + offer_accepted

    return {
        "total_calls": total_calls,
        "sms_vm_sent": sms_vm_sent,
        "emails_sent": len(emails),
        "offers_made": offers_made,
        "offer_accepted": offer_accepted,
        "total_talk_time_seconds": total_talk_time,
        "made_contact_total": made_contact_total,
        "made_contact_breakdown": {
            "made_contact": made_contact_count,
            "not_interested": not_interested_count,
            "offer_made": offers_made,
            "offer_accepted": offer_accepted,
        },
    }


def _compute_conversion(activity: Dict[str, Any], deeds_signed: int,
                         avg_talk_time_deed: float) -> Dict[str, Any]:
    total_calls = activity["total_calls"]
    made_contact_total = activity["made_contact_total"]
    offers_made = activity["offers_made"]
    sms_vm_sent = activity["sms_vm_sent"]
    emails_sent = activity["emails_sent"]
    offer_accepted = activity["offer_accepted"]

    return {
        "contact_rate_pct": round(_safe_div(made_contact_total, total_calls) * 100, 2),
        "calls_to_offer_pct": round(_safe_div(offers_made, made_contact_total) * 100, 2),
        "sms_to_offer_pct": round(_safe_div(offers_made, sms_vm_sent) * 100, 2),
        "all_outbound_to_offer_pct": round(
            _safe_div(offers_made, total_calls + sms_vm_sent + emails_sent) * 100, 2
        ),
        "offer_acceptance_rate_pct": round(_safe_div(offer_accepted, offers_made) * 100, 2),
        "avg_talk_time_deed_signed_seconds": round(avg_talk_time_deed, 2),
        "calls_per_signed_deed": round(_safe_div(total_calls, deeds_signed), 2),
    }


def _compute_equity_revenue(opps: List[Dict], total_calls: int,
                             offers_made: int) -> Dict[str, Any]:
    """Compute equity / revenue metrics from deed-purchased opportunities.

    Opportunity `value` in Close is stored in **cents** -- divide by 100.
    We also try the custom Agreed Amount field as a fallback.
    """
    values: List[float] = []
    for opp in opps:
        raw_value = opp.get("value")
        if raw_value is not None:
            values.append(raw_value / 100.0)
        else:
            # Fallback to custom field (assumed to already be in dollars)
            agreed = opp.get("custom.cf_gIUKqozkoglmXE73Rbwo2EhIM54UuHP8SGLL6hxigHc")
            if agreed is not None:
                try:
                    values.append(float(agreed))
                except (TypeError, ValueError):
                    pass

    total_equity = sum(values)
    avg_equity = _safe_div(total_equity, len(values)) if values else 0

    return {
        "avg_equity_per_deal": round(avg_equity, 2),
        "total_equity": round(total_equity, 2),
        "total_revenue": round(total_equity, 2),
        "revenue_per_call": round(_safe_div(total_equity, total_calls), 2),
        "revenue_per_offer": round(_safe_div(total_equity, offers_made), 2),
    }


def _compute_commission(total_revenue_mtd: float, commission_rate: float,
                         days_elapsed: int, days_in_month: int,
                         talk_time_seconds: float) -> Dict[str, Any]:
    commission_mtd = total_revenue_mtd * commission_rate
    est_monthly_revenue = _safe_div(total_revenue_mtd, days_elapsed) * days_in_month
    est_monthly_commission = est_monthly_revenue * commission_rate
    effective_hourly = _safe_div(commission_mtd, talk_time_seconds / 3600.0) if talk_time_seconds else 0

    return {
        "commission_mtd": round(commission_mtd, 2),
        "est_monthly_revenue": round(est_monthly_revenue, 2),
        "est_monthly_commission": round(est_monthly_commission, 2),
        "effective_hourly_rate": round(effective_hourly, 2),
    }


def _avg_talk_time_for_deed_leads(opps: List[Dict],
                                   date_start: str,
                                   date_end: str) -> float:
    """Best-effort average call duration for leads that have a deed-purchased opportunity."""
    lead_ids = list({opp.get("lead_id") for opp in opps if opp.get("lead_id")})
    if not lead_ids:
        return 0.0
    try:
        calls = close_api.get_calls_for_leads(lead_ids, date_start=date_start, date_end=date_end)
    except Exception:
        logger.exception("Failed to fetch calls for deed leads")
        return 0.0
    durations = [c.get("duration", 0) or 0 for c in calls]
    return _safe_div(sum(durations), len(durations))


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/api/users", methods=["GET"])
def get_users():
    """Return active users from Close CRM."""
    try:
        users = close_api.get_users()
        result = [
            {
                "id": u.get("id"),
                "first_name": u.get("first_name", ""),
                "last_name": u.get("last_name", ""),
                "email": u.get("email", ""),
            }
            for u in users
        ]
        return jsonify({"users": result})
    except Exception as exc:
        logger.exception("Error fetching users")
        return jsonify({"error": str(exc)}), 500


@app.route("/api/agent-config", methods=["GET"])
def get_agent_config():
    """Return all agent commission configs, auto-adding new users."""
    try:
        users = close_api.get_users()
        configs = _ensure_agent_config_synced(users)
        return jsonify({"configs": configs})
    except Exception as exc:
        logger.exception("Error fetching agent config")
        return jsonify({"error": str(exc)}), 500


@app.route("/api/agent-config/<user_id>", methods=["PUT"])
def update_agent_config(user_id: str):
    """Update a single agent's commission rate."""
    try:
        body = request.get_json(force=True)
        commission_rate = body.get("commission_rate")
        if commission_rate is None:
            return jsonify({"error": "commission_rate is required"}), 400
        try:
            commission_rate = float(commission_rate)
        except (TypeError, ValueError):
            return jsonify({"error": "commission_rate must be a number"}), 400

        configs = _load_agent_config()
        if user_id not in configs:
            configs[user_id] = {"commission_rate": commission_rate, "name": ""}
        else:
            configs[user_id]["commission_rate"] = commission_rate
        _save_agent_config(configs)
        return jsonify({"status": "ok", "user_id": user_id, "commission_rate": commission_rate})
    except Exception as exc:
        logger.exception("Error updating agent config")
        return jsonify({"error": str(exc)}), 500


@app.route("/api/metrics", methods=["GET"])
def get_metrics():
    """Main metrics endpoint.

    Query params:
        period   - daily | weekly | monthly | ytd  (default: daily)
        user_id  - Close user ID or "all" for team  (default: all)
        date     - ISO date string for reference date (default: today)
    """
    try:
        period = request.args.get("period", "daily")
        user_id_param = request.args.get("user_id", "all")
        ref_date = _parse_date(request.args.get("date"))

        user_id: Optional[str] = None if user_id_param == "all" else user_id_param

        # Determine period date range
        p_start, p_end, p_label = _date_range_for_period(period, ref_date)

        # Fetch data from Close API
        calls = close_api.get_calls(p_start.isoformat(), p_end.isoformat(), user_id=user_id)
        emails = close_api.get_emails_sent(p_start.isoformat(), p_end.isoformat(), user_id=user_id)
        opps = close_api.get_opportunities_deed_purchased(
            date_start=p_start.isoformat(), date_end=p_end.isoformat()
        )
        # If filtering by user, also filter opportunities by assigned user
        if user_id:
            opps = [o for o in opps if o.get("user_id") == user_id]

        deeds_signed = len(opps)

        # Activity
        activity = _compute_activity(calls, emails)

        # Avg talk time for deed-signed leads (best-effort)
        avg_tt_deed = _avg_talk_time_for_deed_leads(opps, p_start.isoformat(), p_end.isoformat())

        # Conversion
        conversion = _compute_conversion(activity, deeds_signed, avg_tt_deed)

        # Equity / Revenue
        equity_revenue = _compute_equity_revenue(
            opps, activity["total_calls"], activity["offers_made"]
        )

        # Commission -- always computed for the current month regardless of period
        today = date.today()
        m_start, m_end = _month_range(today)
        if period == "monthly" and p_start.month == today.month and p_start.year == today.year:
            # Already have the right data
            mtd_revenue = equity_revenue["total_revenue"]
            mtd_talk_time = activity["total_talk_time_seconds"]
        else:
            # Fetch current-month data separately for commission calc
            mtd_calls = close_api.get_calls(m_start.isoformat(), m_end.isoformat(), user_id=user_id)
            mtd_emails = close_api.get_emails_sent(m_start.isoformat(), m_end.isoformat(), user_id=user_id)
            mtd_opps = close_api.get_opportunities_deed_purchased(
                date_start=m_start.isoformat(), date_end=m_end.isoformat()
            )
            if user_id:
                mtd_opps = [o for o in mtd_opps if o.get("user_id") == user_id]
            mtd_activity = _compute_activity(mtd_calls, mtd_emails)
            mtd_eq = _compute_equity_revenue(mtd_opps, mtd_activity["total_calls"], mtd_activity["offers_made"])
            mtd_revenue = mtd_eq["total_revenue"]
            mtd_talk_time = mtd_activity["total_talk_time_seconds"]

        days_elapsed = max((today - m_start).days, 1)
        days_in_month = calendar.monthrange(today.year, today.month)[1]

        # Look up commission rate
        configs = _load_agent_config()
        if user_id and user_id in configs:
            commission_rate = configs[user_id].get("commission_rate", DEFAULT_COMMISSION_RATE)
        else:
            commission_rate = DEFAULT_COMMISSION_RATE

        commission = _compute_commission(
            mtd_revenue, commission_rate, days_elapsed, days_in_month, mtd_talk_time
        )

        return jsonify({
            "period": {
                "start": p_start.isoformat(),
                "end": (p_end - timedelta(days=1)).isoformat(),
                "label": p_label,
            },
            "activity": activity,
            "conversion": conversion,
            "equity_revenue": equity_revenue,
            "commission": commission,
            "deeds_signed": deeds_signed,
        })

    except Exception as exc:
        logger.exception("Error computing metrics")
        return jsonify({"error": str(exc)}), 500


@app.route("/api/leaderboard", methods=["GET"])
def get_leaderboard():
    """Leaderboard: all agents ranked by commission MTD.

    Query params:
        period - daily | weekly | monthly | ytd  (default: monthly)
    """
    try:
        period = request.args.get("period", "monthly")
        ref_date = _parse_date(request.args.get("date"))
        p_start, p_end, _label = _date_range_for_period(period, ref_date)

        users = close_api.get_users()
        configs = _ensure_agent_config_synced(users)

        # Fetch all calls, emails, and opps for the period (team-wide, then split)
        all_calls = close_api.get_calls(p_start.isoformat(), p_end.isoformat())
        all_emails = close_api.get_emails_sent(p_start.isoformat(), p_end.isoformat())
        all_opps = close_api.get_opportunities_deed_purchased(
            date_start=p_start.isoformat(), date_end=p_end.isoformat()
        )

        # For commission, we need MTD data
        today = date.today()
        m_start, m_end = _month_range(today)
        is_current_month = (
            period == "monthly"
            and p_start.month == today.month
            and p_start.year == today.year
        )

        if is_current_month:
            mtd_calls = all_calls
            mtd_opps = all_opps
        else:
            mtd_calls = close_api.get_calls(m_start.isoformat(), m_end.isoformat())
            mtd_opps = close_api.get_opportunities_deed_purchased(
                date_start=m_start.isoformat(), date_end=m_end.isoformat()
            )

        days_elapsed = max((today - m_start).days, 1)
        days_in_month = calendar.monthrange(today.year, today.month)[1]

        agents: List[Dict[str, Any]] = []
        for user in users:
            uid = user.get("id", "")
            name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()

            # Period-scoped data for this user
            user_calls = [c for c in all_calls if c.get("user_id") == uid]
            user_emails = [e for e in all_emails if e.get("user_id") == uid]
            user_opps = [o for o in all_opps if o.get("user_id") == uid]

            activity = _compute_activity(user_calls, user_emails)

            # MTD commission
            user_mtd_calls = [c for c in mtd_calls if c.get("user_id") == uid]
            user_mtd_opps = [o for o in mtd_opps if o.get("user_id") == uid]
            mtd_eq = _compute_equity_revenue(
                user_mtd_opps,
                len([c for c in user_mtd_calls if c.get("direction") == "outgoing"]),
                0,
            )
            rate = configs.get(uid, {}).get("commission_rate", DEFAULT_COMMISSION_RATE)
            commission_mtd = round(mtd_eq["total_revenue"] * rate, 2)

            agents.append({
                "id": uid,
                "name": name,
                "commission_mtd": commission_mtd,
                "talk_time_seconds": activity["total_talk_time_seconds"],
                "offers_made": activity["offers_made"],
                "contact_rate_pct": round(
                    _safe_div(activity["made_contact_total"], activity["total_calls"]) * 100, 2
                ),
                "total_calls": activity["total_calls"],
                "sms_vm_sent": activity["sms_vm_sent"],
            })

        # Sort by commission descending
        agents.sort(key=lambda a: a["commission_mtd"], reverse=True)

        return jsonify({"agents": agents})

    except Exception as exc:
        logger.exception("Error computing leaderboard")
        return jsonify({"error": str(exc)}), 500


@app.route("/api/refresh", methods=["POST"])
def refresh_cache():
    """Clear the in-memory cache so the next request fetches fresh data."""
    close_api.clear_cache()
    return jsonify({"status": "ok", "message": "Cache cleared"})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(debug=True, port=5000)
