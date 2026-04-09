"""
Configuration constants for the Close CRM KPI Dashboard.

Contains all Close CRM IDs, custom field references, and application settings.
"""

# ---------------------------------------------------------------------------
# Close CRM API
# ---------------------------------------------------------------------------
CLOSE_API_BASE = "https://api.close.com/api/v1"

# ---------------------------------------------------------------------------
# Call Outcome IDs (from Close CRM)
# ---------------------------------------------------------------------------
OUTCOME_NO_ANSWER = "outcome_032ChScvXTjfHO4GOOHxE2"
OUTCOME_NO_ANSWER_SMS = "outcome_032w8Dt922ZyNwTIGH8FUm"  # proxy for SMS/VM
OUTCOME_MADE_CONTACT = "outcome_032Chfr1wqD3FfANNU99SD"
OUTCOME_NOT_INTERESTED = "outcome_032Chcy3CNJgijL5QuGgKr"
OUTCOME_OFFER_MADE = "outcome_032ltAhzqIeSiVUl71j4tE"
OUTCOME_OFFER_ACCEPTED = "outcome_032nhQHzA2RF0wtrrgmNqJ"
OUTCOME_INCOMING_ANSWERED = "outcome_032negt0h9Hxy8Tv7mA7Cd"
OUTCOME_WRONG_NUMBER = "outcome_032rfPxOn9CaEHs68UsqYD"
OUTCOME_HUNG_UP = "outcome_032ChebWAv4ef0er1I5KZ8"
OUTCOME_INCOMING_MISSED = "outcome_032sGUE1h5QYQmVhEYbDhN"
OUTCOME_DEAD_NUMBER = "outcome_032wHeJyXXFK2XpNt8GccH"

# "Made Contact (total)" — the union of outcomes that count as having reached
# a live person and had a substantive conversation or result.
MADE_CONTACT_OUTCOME_IDS = [
    OUTCOME_MADE_CONTACT,
    OUTCOME_NOT_INTERESTED,
    OUTCOME_OFFER_MADE,
    OUTCOME_OFFER_ACCEPTED,
]

# Human-readable map (outcome_id -> label) for convenience
OUTCOME_LABEL_MAP = {
    OUTCOME_NO_ANSWER: "No Answer",
    OUTCOME_NO_ANSWER_SMS: "No Answer/SMS",
    OUTCOME_MADE_CONTACT: "Made Contact",
    OUTCOME_NOT_INTERESTED: "Not Interested",
    OUTCOME_OFFER_MADE: "Offer Made",
    OUTCOME_OFFER_ACCEPTED: "Offer Accepted",
    OUTCOME_INCOMING_ANSWERED: "Incoming Call Answered",
    OUTCOME_WRONG_NUMBER: "Wrong Number",
    OUTCOME_HUNG_UP: "Hung Up",
    OUTCOME_INCOMING_MISSED: "Incoming Missed Call",
    OUTCOME_DEAD_NUMBER: "Dead Number",
}

# ---------------------------------------------------------------------------
# Pipeline / Status IDs
# ---------------------------------------------------------------------------
CURATIVE_TITLE_PIPELINE_ID = "pipe_2JsPpNQnHBPVhHiufKXc9c"
DEED_PURCHASED_STATUS_ID = "stat_n1c7rOvbMvGsWYwKFh9lSxtSknekeiSkFVvu7CRoKpz"

# ---------------------------------------------------------------------------
# Opportunity Custom Fields
# ---------------------------------------------------------------------------
CF_AGREED_AMOUNT = "custom.cf_gIUKqozkoglmXE73Rbwo2EhIM54UuHP8SGLL6hxigHc"
CF_DEED_PURCHASED_DATE = "custom.cf_lw58TP3P0NDgIODMreEpUCtJfKH4ILPYTKA8F7IAKtU"
CF_SHARE_PCT = "custom.cf_ELMvfZ5EaH9BRfABxaQeW2O0N0FqDMXXzxgHfYF8Dbv"

# ---------------------------------------------------------------------------
# Commission Rates
# ---------------------------------------------------------------------------
DEFAULT_COMMISSION_RATE = 0.15
JUNIOR_COMMISSION_RATE = 0.05

# ---------------------------------------------------------------------------
# Caching
# ---------------------------------------------------------------------------
CACHE_TTL_SECONDS = 900  # 15 minutes
