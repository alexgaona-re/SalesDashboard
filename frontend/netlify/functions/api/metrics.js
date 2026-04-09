// Metrics computation logic for the Close CRM KPI Dashboard
// Ported from backend/app.py

const {
  OUTCOME_NO_ANSWER_SMS,
  OUTCOME_MADE_CONTACT,
  OUTCOME_NOT_INTERESTED,
  OUTCOME_OFFER_MADE,
  OUTCOME_OFFER_ACCEPTED,
  CF_AGREED_AMOUNT,
} = require("./config");

function safeDiv(num, den, def = 0) {
  return den === 0 ? def : num / den;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function extractOutcomeId(call) {
  return call.call_outcome_id || call.outcome_id || null;
}

function computeActivity(calls, emails) {
  const outbound = calls.filter((c) => c.direction === "outgoing");
  const totalCalls = outbound.length;

  let smsVmSent = 0;
  let offersMade = 0;
  let offerAccepted = 0;
  let madeContactCount = 0;
  let notInterestedCount = 0;
  let totalTalkTime = 0;

  for (const c of outbound) {
    const oid = extractOutcomeId(c);
    if (oid === OUTCOME_NO_ANSWER_SMS) smsVmSent++;
    if (oid === OUTCOME_OFFER_MADE) offersMade++;
    if (oid === OUTCOME_OFFER_ACCEPTED) offerAccepted++;
    if (oid === OUTCOME_MADE_CONTACT) madeContactCount++;
    if (oid === OUTCOME_NOT_INTERESTED) notInterestedCount++;
    totalTalkTime += c.duration || 0;
  }

  const madeContactTotal =
    madeContactCount + notInterestedCount + offersMade + offerAccepted;

  return {
    total_calls: totalCalls,
    sms_vm_sent: smsVmSent,
    emails_sent: emails.length,
    offers_made: offersMade,
    offer_accepted: offerAccepted,
    total_talk_time_seconds: totalTalkTime,
    made_contact_total: madeContactTotal,
    made_contact_breakdown: {
      made_contact: madeContactCount,
      not_interested: notInterestedCount,
      offer_made: offersMade,
      offer_accepted: offerAccepted,
    },
  };
}

function computeConversion(activity, deedsSigned, avgTalkTimeDeed) {
  const {
    total_calls,
    made_contact_total,
    offers_made,
    sms_vm_sent,
    emails_sent,
    offer_accepted,
  } = activity;

  return {
    contact_rate_pct: round2(safeDiv(made_contact_total, total_calls) * 100),
    calls_to_offer_pct: round2(safeDiv(offers_made, made_contact_total) * 100),
    sms_to_offer_pct: round2(safeDiv(offers_made, sms_vm_sent) * 100),
    all_outbound_to_offer_pct: round2(
      safeDiv(offers_made, total_calls + sms_vm_sent + emails_sent) * 100
    ),
    offer_acceptance_rate_pct: round2(
      safeDiv(offer_accepted, offers_made) * 100
    ),
    avg_talk_time_deed_signed_seconds: round2(avgTalkTimeDeed),
    calls_per_signed_deed: round2(safeDiv(total_calls, deedsSigned)),
  };
}

function computeEquityRevenue(opps, totalCalls, offersMade) {
  const values = [];
  for (const opp of opps) {
    if (opp.value != null) {
      values.push(opp.value / 100.0);
    } else {
      const agreed = opp[CF_AGREED_AMOUNT];
      if (agreed != null) {
        const num = parseFloat(agreed);
        if (!isNaN(num)) values.push(num);
      }
    }
  }

  const totalEquity = values.reduce((a, b) => a + b, 0);
  const avgEquity = values.length ? safeDiv(totalEquity, values.length) : 0;

  return {
    avg_equity_per_deal: round2(avgEquity),
    total_equity: round2(totalEquity),
    total_revenue: round2(totalEquity),
    revenue_per_call: round2(safeDiv(totalEquity, totalCalls)),
    revenue_per_offer: round2(safeDiv(totalEquity, offersMade)),
  };
}

function computeCommission(
  totalRevenueMtd,
  commissionRate,
  daysElapsed,
  daysInMonth,
  talkTimeSeconds
) {
  const commissionMtd = totalRevenueMtd * commissionRate;
  const estMonthlyRevenue =
    safeDiv(totalRevenueMtd, daysElapsed) * daysInMonth;
  const estMonthlyCommission = estMonthlyRevenue * commissionRate;
  const effectiveHourly = talkTimeSeconds
    ? safeDiv(commissionMtd, talkTimeSeconds / 3600)
    : 0;

  return {
    commission_mtd: round2(commissionMtd),
    est_monthly_revenue: round2(estMonthlyRevenue),
    est_monthly_commission: round2(estMonthlyCommission),
    effective_hourly_rate: round2(effectiveHourly),
  };
}

module.exports = {
  safeDiv,
  round2,
  computeActivity,
  computeConversion,
  computeEquityRevenue,
  computeCommission,
};
