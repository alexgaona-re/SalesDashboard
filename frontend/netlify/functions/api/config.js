// Close CRM API configuration constants
// Mirrored from backend/config.py for Netlify Functions

const CLOSE_API_BASE = "https://api.close.com/api/v1";

// Call Outcome IDs
const OUTCOME_NO_ANSWER_SMS = "outcome_032w8Dt922ZyNwTIGH8FUm";
const OUTCOME_MADE_CONTACT = "outcome_032Chfr1wqD3FfANNU99SD";
const OUTCOME_NOT_INTERESTED = "outcome_032Chcy3CNJgijL5QuGgKr";
const OUTCOME_OFFER_MADE = "outcome_032ltAhzqIeSiVUl71j4tE";
const OUTCOME_OFFER_ACCEPTED = "outcome_032nhQHzA2RF0wtrrgmNqJ";

const MADE_CONTACT_OUTCOME_IDS = [
  OUTCOME_MADE_CONTACT,
  OUTCOME_NOT_INTERESTED,
  OUTCOME_OFFER_MADE,
  OUTCOME_OFFER_ACCEPTED,
];

// Pipeline / Status IDs
const DEED_PURCHASED_STATUS_ID = "stat_n1c7rOvbMvGsWYwKFh9lSxtSknekeiSkFVvu7CRoKpz";

// Opportunity Custom Fields
const CF_AGREED_AMOUNT = "custom.cf_gIUKqozkoglmXE73Rbwo2EhIM54UuHP8SGLL6hxigHc";

// Commission
const DEFAULT_COMMISSION_RATE = 0.15;

module.exports = {
  CLOSE_API_BASE,
  OUTCOME_NO_ANSWER_SMS,
  OUTCOME_MADE_CONTACT,
  OUTCOME_NOT_INTERESTED,
  OUTCOME_OFFER_MADE,
  OUTCOME_OFFER_ACCEPTED,
  MADE_CONTACT_OUTCOME_IDS,
  DEED_PURCHASED_STATUS_ID,
  CF_AGREED_AMOUNT,
  DEFAULT_COMMISSION_RATE,
};
