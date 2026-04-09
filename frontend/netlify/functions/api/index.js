// Main Netlify Function handler for /api/* routes
// Replaces the Flask backend for serverless deployment on Netlify

const closeApi = require("./close-api");
const {
  computeActivity,
  computeConversion,
  computeEquityRevenue,
  computeCommission,
  safeDiv,
} = require("./metrics");
const { DEFAULT_COMMISSION_RATE } = require("./config");

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(data, statusCode = 200) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(data),
  };
}

function parseDate(isoStr) {
  if (isoStr) {
    const parts = isoStr.split("-");
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        return new Date(y, m, d);
      }
    }
  }
  return new Date();
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateRangeForPeriod(period, ref) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const day = ref.getDate();
  const dow = ref.getDay(); // 0 = Sunday

  if (period === "daily") {
    return {
      start: new Date(y, m, day),
      end: new Date(y, m, day + 1),
      label: toISODate(ref),
    };
  }

  if (period === "weekly") {
    const mondayOffset = dow === 0 ? 6 : dow - 1;
    const start = new Date(y, m, day - mondayOffset);
    const end = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + 7
    );
    return { start, end, label: `Week of ${toISODate(start)}` };
  }

  if (period === "monthly") {
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 1);
    const label = ref.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });
    return { start, end, label };
  }

  if (period === "ytd") {
    return {
      start: new Date(y, 0, 1),
      end: new Date(y, m, day + 1),
      label: `YTD ${y}`,
    };
  }

  // Default to daily
  return {
    start: new Date(y, m, day),
    end: new Date(y, m, day + 1),
    label: toISODate(ref),
  };
}

function monthRange(ref) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  return {
    start: new Date(y, m, 1),
    end: new Date(y, m + 1, 1),
  };
}

function daysInMonth(ref) {
  return new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
}

// -----------------------------------------------------------------------
// Route handlers
// -----------------------------------------------------------------------

async function handleUsers(apiKey) {
  const users = await closeApi.getUsers(apiKey);
  return jsonResponse({
    users: users.map((u) => ({
      id: u.id,
      first_name: u.first_name || "",
      last_name: u.last_name || "",
      email: u.email || "",
    })),
  });
}

async function handleAgentConfig(apiKey) {
  const users = await closeApi.getUsers(apiKey);
  const configs = {};
  for (const u of users) {
    if (u.id) {
      configs[u.id] = {
        commission_rate: DEFAULT_COMMISSION_RATE,
        name: `${u.first_name || ""} ${u.last_name || ""}`.trim(),
      };
    }
  }
  return jsonResponse({ configs });
}

async function handleUpdateAgentConfig(body, userId) {
  // Stateless on Netlify -- acknowledge the update
  const commissionRate = body.commission_rate;
  if (commissionRate == null) {
    return jsonResponse({ error: "commission_rate is required" }, 400);
  }
  const rate = parseFloat(commissionRate);
  if (isNaN(rate)) {
    return jsonResponse({ error: "commission_rate must be a number" }, 400);
  }
  return jsonResponse({
    status: "ok",
    user_id: userId,
    commission_rate: rate,
  });
}

async function handleMetrics(apiKey, params) {
  const period = params.period || "daily";
  const userIdParam = params.user_id || "all";
  const refDate = parseDate(params.date);
  const userId = userIdParam === "all" ? null : userIdParam;

  const { start: pStart, end: pEnd, label: pLabel } = dateRangeForPeriod(
    period,
    refDate
  );
  const pStartStr = toISODate(pStart);
  const pEndStr = toISODate(pEnd);

  // Fetch data from Close API in parallel
  const [calls, emails, allOpps] = await Promise.all([
    closeApi.getCalls(apiKey, pStartStr, pEndStr, userId),
    closeApi.getEmailsSent(apiKey, pStartStr, pEndStr, userId),
    closeApi.getOpportunitiesDeedPurchased(apiKey, pStartStr, pEndStr),
  ]);

  const opps = userId ? allOpps.filter((o) => o.user_id === userId) : allOpps;
  const deedsSigned = opps.length;

  // Activity
  const activity = computeActivity(calls, emails);

  // Avg talk time for deed-signed leads (best-effort)
  let avgTtDeed = 0;
  const leadIds = [...new Set(opps.map((o) => o.lead_id).filter(Boolean))];
  if (leadIds.length) {
    try {
      const deedCalls = await closeApi.getCallsForLeads(
        apiKey,
        leadIds,
        pStartStr,
        pEndStr
      );
      const durations = deedCalls.map((c) => c.duration || 0);
      avgTtDeed =
        durations.length > 0
          ? durations.reduce((a, b) => a + b, 0) / durations.length
          : 0;
    } catch (_) {
      // best effort -- ignore errors
    }
  }

  // Conversion
  const conversion = computeConversion(activity, deedsSigned, avgTtDeed);

  // Equity / Revenue
  const equityRevenue = computeEquityRevenue(
    opps,
    activity.total_calls,
    activity.offers_made
  );

  // Commission -- always computed for the current month
  const today = new Date();
  const mRange = monthRange(today);
  const mStartStr = toISODate(mRange.start);
  const mEndStr = toISODate(mRange.end);

  let mtdRevenue, mtdTalkTime;
  const isCurMonth =
    period === "monthly" &&
    pStart.getMonth() === today.getMonth() &&
    pStart.getFullYear() === today.getFullYear();

  if (isCurMonth) {
    mtdRevenue = equityRevenue.total_revenue;
    mtdTalkTime = activity.total_talk_time_seconds;
  } else {
    const [mtdCalls, mtdEmails, mtdAllOpps] = await Promise.all([
      closeApi.getCalls(apiKey, mStartStr, mEndStr, userId),
      closeApi.getEmailsSent(apiKey, mStartStr, mEndStr, userId),
      closeApi.getOpportunitiesDeedPurchased(apiKey, mStartStr, mEndStr),
    ]);
    const mtdOpps = userId
      ? mtdAllOpps.filter((o) => o.user_id === userId)
      : mtdAllOpps;
    const mtdActivity = computeActivity(mtdCalls, mtdEmails);
    const mtdEq = computeEquityRevenue(
      mtdOpps,
      mtdActivity.total_calls,
      mtdActivity.offers_made
    );
    mtdRevenue = mtdEq.total_revenue;
    mtdTalkTime = mtdActivity.total_talk_time_seconds;
  }

  const daysElapsed = Math.max(
    Math.floor((today - mRange.start) / 86400000),
    1
  );
  const dimMonth = daysInMonth(today);

  const commission = computeCommission(
    mtdRevenue,
    DEFAULT_COMMISSION_RATE,
    daysElapsed,
    dimMonth,
    mtdTalkTime
  );

  const endDisplay = new Date(pEnd);
  endDisplay.setDate(endDisplay.getDate() - 1);

  return jsonResponse({
    period: {
      start: pStartStr,
      end: toISODate(endDisplay),
      label: pLabel,
    },
    activity,
    conversion,
    equity_revenue: equityRevenue,
    commission,
    deeds_signed: deedsSigned,
  });
}

async function handleLeaderboard(apiKey, params) {
  const period = params.period || "monthly";
  const refDate = parseDate(params.date);
  const { start: pStart, end: pEnd } = dateRangeForPeriod(period, refDate);
  const pStartStr = toISODate(pStart);
  const pEndStr = toISODate(pEnd);

  const [users, allCalls, allEmails, allOpps] = await Promise.all([
    closeApi.getUsers(apiKey),
    closeApi.getCalls(apiKey, pStartStr, pEndStr),
    closeApi.getEmailsSent(apiKey, pStartStr, pEndStr),
    closeApi.getOpportunitiesDeedPurchased(apiKey, pStartStr, pEndStr),
  ]);

  // For commission we need MTD data
  const today = new Date();
  const mRange = monthRange(today);
  const isCurMonth =
    period === "monthly" &&
    pStart.getMonth() === today.getMonth() &&
    pStart.getFullYear() === today.getFullYear();

  let mtdCalls, mtdOpps;
  if (isCurMonth) {
    mtdCalls = allCalls;
    mtdOpps = allOpps;
  } else {
    [mtdCalls, mtdOpps] = await Promise.all([
      closeApi.getCalls(apiKey, toISODate(mRange.start), toISODate(mRange.end)),
      closeApi.getOpportunitiesDeedPurchased(
        apiKey,
        toISODate(mRange.start),
        toISODate(mRange.end)
      ),
    ]);
  }

  const agents = users.map((user) => {
    const uid = user.id || "";
    const name = `${user.first_name || ""} ${user.last_name || ""}`.trim();

    const userCalls = allCalls.filter((c) => c.user_id === uid);
    const userEmails = allEmails.filter((e) => e.user_id === uid);
    const activity = computeActivity(userCalls, userEmails);

    // MTD commission
    const userMtdCalls = mtdCalls.filter((c) => c.user_id === uid);
    const userMtdOpps = mtdOpps.filter((o) => o.user_id === uid);
    const mtdEq = computeEquityRevenue(
      userMtdOpps,
      userMtdCalls.filter((c) => c.direction === "outgoing").length,
      0
    );
    const commissionMtd = Math.round(
      mtdEq.total_revenue * DEFAULT_COMMISSION_RATE * 100
    ) / 100;

    return {
      id: uid,
      name,
      commission_mtd: commissionMtd,
      talk_time_seconds: activity.total_talk_time_seconds,
      offers_made: activity.offers_made,
      contact_rate_pct: Math.round(
        safeDiv(activity.made_contact_total, activity.total_calls) * 10000
      ) / 100,
      total_calls: activity.total_calls,
      sms_vm_sent: activity.sms_vm_sent,
    };
  });

  agents.sort((a, b) => b.commission_mtd - a.commission_mtd);
  return jsonResponse({ agents });
}

// -----------------------------------------------------------------------
// Main handler
// -----------------------------------------------------------------------

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey) {
    return jsonResponse(
      { error: "CLOSE_API_KEY environment variable is not configured" },
      500
    );
  }

  // Extract the route from the original URL (handles both direct and rewritten paths)
  let path = "/";
  if (event.rawUrl) {
    const url = new URL(event.rawUrl);
    path = url.pathname.replace(/^\/api/, "") || "/";
  } else {
    path = (event.path || "").replace(/^\/(\.netlify\/functions\/api|api)/, "") || "/";
  }
  const params = event.queryStringParameters || {};

  try {
    // GET /api/users
    if (path === "/users" && event.httpMethod === "GET") {
      return await handleUsers(apiKey);
    }

    // GET /api/metrics
    if (path === "/metrics" && event.httpMethod === "GET") {
      return await handleMetrics(apiKey, params);
    }

    // GET /api/leaderboard
    if (path === "/leaderboard" && event.httpMethod === "GET") {
      return await handleLeaderboard(apiKey, params);
    }

    // GET /api/agent-config
    if (path === "/agent-config" && event.httpMethod === "GET") {
      return await handleAgentConfig(apiKey);
    }

    // PUT /api/agent-config/:user_id
    if (path.startsWith("/agent-config/") && event.httpMethod === "PUT") {
      const userId = path.replace("/agent-config/", "");
      const body = JSON.parse(event.body || "{}");
      return await handleUpdateAgentConfig(body, userId);
    }

    // POST /api/refresh
    if (path === "/refresh" && event.httpMethod === "POST") {
      return jsonResponse({ status: "ok", message: "Cache cleared" });
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (err) {
    console.error("API error:", err);
    return jsonResponse({ error: err.message || "Internal server error" }, 500);
  }
};
