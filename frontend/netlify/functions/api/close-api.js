// Close CRM REST API wrapper for Netlify Functions
// Ported from backend/close_api.py

const { CLOSE_API_BASE, DEED_PURCHASED_STATUS_ID } = require("./config");

const MAX_PAGE_SIZE = 200;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiRequest(apiKey, method, path, params = {}) {
  const url = new URL(`${CLOSE_API_BASE}/${path.replace(/^\//, "")}`);
  if (method === "GET") {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }

  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  let backoff = RETRY_BACKOFF_MS;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url.toString(), {
        method,
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
      });

      if (resp.status === 429) {
        const retryAfter =
          parseInt(resp.headers.get("Retry-After") || String(backoff / 1000), 10) * 1000;
        if (attempt === MAX_RETRIES) {
          throw new Error(`Close API rate limited after ${MAX_RETRIES} retries`);
        }
        await sleep(retryAfter);
        backoff *= 2;
        continue;
      }

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Close API error ${resp.status}: ${text}`);
      }

      return await resp.json();
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      await sleep(backoff);
      backoff *= 2;
    }
  }

  throw new Error(`Failed after ${MAX_RETRIES} attempts`);
}

async function paginate(apiKey, path, params = {}) {
  params._limit = MAX_PAGE_SIZE;
  params._skip = 0;

  const results = [];
  while (true) {
    const body = await apiRequest(apiKey, "GET", path, { ...params });
    const data = body.data || [];
    results.push(...data);
    if (!body.has_more) break;
    params._skip += data.length;
  }
  return results;
}

async function getUsers(apiKey) {
  const body = await apiRequest(apiKey, "GET", "/user/");
  const users = body.data || [];
  return users.filter((u) => (u.status || "active") !== "inactive");
}

async function getCalls(apiKey, dateStart, dateEnd, userId = null) {
  const params = {
    date_created__gte: dateStart,
    date_created__lt: dateEnd,
    _type: "Call",
  };
  if (userId) params.user_id = userId;
  return paginate(apiKey, "/activity/call/", params);
}

async function getEmailsSent(apiKey, dateStart, dateEnd, userId = null) {
  const params = {
    date_created__gte: dateStart,
    date_created__lt: dateEnd,
    _type: "Email",
  };
  if (userId) params.user_id = userId;
  const all = await paginate(apiKey, "/activity/email/", params);
  return all.filter((e) => e.direction === "outgoing");
}

async function getOpportunitiesDeedPurchased(apiKey, dateStart = null, dateEnd = null) {
  const params = {
    status_id: DEED_PURCHASED_STATUS_ID,
  };
  if (dateStart) params.date_won__gte = dateStart;
  if (dateEnd) params.date_won__lt = dateEnd;
  return paginate(apiKey, "/opportunity/", params);
}

async function getCallsForLeads(apiKey, leadIds, dateStart = null, dateEnd = null) {
  if (!leadIds || !leadIds.length) return [];
  const allCalls = [];
  for (const lid of leadIds) {
    const params = {
      lead_id: lid,
      _type: "Call",
    };
    if (dateStart) params.date_created__gte = dateStart;
    if (dateEnd) params.date_created__lt = dateEnd;
    const calls = await paginate(apiKey, "/activity/call/", params);
    allCalls.push(...calls);
  }
  return allCalls;
}

module.exports = {
  getUsers,
  getCalls,
  getEmailsSent,
  getOpportunitiesDeedPurchased,
  getCallsForLeads,
};
