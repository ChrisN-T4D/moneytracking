#!/usr/bin/env node
/**
 * One-time neu1 PocketBase repairs: seed auto_transfers if empty, remove duplicate $0 Melodee row.
 */
const PB = (process.env.PB_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || "").replace(/\/$/, "");
const EMAIL = process.env.PB_EMAIL || process.env.POCKETBASE_ADMIN_EMAIL || "";
const PASS = process.env.PB_PASSWORD || process.env.POCKETBASE_ADMIN_PASSWORD || "";

const SEED_TRANSFERS = [
  { whatFor: "Oklahoma Bill Covering", frequency: "Monthly", account: "Oklahoma Bills", date: "2026-03-02", amount: 3400 },
  { whatFor: "Oklahoma Bill Remaining", frequency: "2weeks", account: "Oklahoma Bills", date: "2026-02-13", amount: 80 },
  { whatFor: "Spanish Fork Bill Covering", frequency: "2weeks", account: "Spanish Fork Bills", date: "2026-02-13", amount: 300 },
  { whatFor: "Subscription Covering", frequency: "2weeks", account: "Spanish Fork Bills", date: "2026-02-13", amount: 35 },
  { whatFor: "Fun Money (Chris)", frequency: "2weeks", account: "Chris Account", date: "2026-02-13", amount: 100 },
  { whatFor: "Fun Money (Melodee)", frequency: "2weeks", account: "Melodee Account", date: "2026-02-13", amount: 100 },
];

async function auth() {
  const body = JSON.stringify({ identity: EMAIL, password: PASS });
  const headers = { "Content-Type": "application/json" };
  for (const path of ["/api/admins/auth-with-password", "/api/collections/_superusers/auth-with-password"]) {
    const res = await fetch(`${PB}${path}`, { method: "POST", headers, body });
    if (res.ok) {
      const data = await res.json();
      if (data.token) return data.token;
    }
  }
  throw new Error("auth failed");
}

async function list(token, collection) {
  const res = await fetch(`${PB}/api/collections/${collection}/records?perPage=500`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${collection} list ${res.status}`);
  return (await res.json()).items ?? [];
}

async function post(token, collection, body) {
  const res = await fetch(`${PB}/api/collections/${collection}/records`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`POST ${collection} ${res.status}: ${t}`);
  }
  return res.json();
}

async function del(token, collection, id) {
  const res = await fetch(`${PB}/api/collections/${collection}/records/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`DELETE ${collection}/${id} ${res.status}`);
}

function normName(n) {
  return (n ?? "").toLowerCase().trim().replace(/\s+/g, "").replace(/&/g, "");
}

const token = await auth();
const headers = { Authorization: `Bearer ${token}` };

// 1. Seed auto_transfers if empty
const transfers = await list(token, "auto_transfers");
if (transfers.length === 0) {
  console.log("Seeding auto_transfers...");
  for (const row of SEED_TRANSFERS) {
    const created = await post(token, "auto_transfers", row);
    console.log(`  + ${row.whatFor} (${created.id})`);
  }
} else {
  console.log(`auto_transfers already has ${transfers.length} rows — skip seed`);
}

// 2. Remove duplicate Melodee fun money $0 row (keep the $100 row)
const bills = await list(token, "bills");
const melodee = bills.filter((b) => normName(b.name).includes("melodee") && normName(b.name).includes("fun"));
if (melodee.length > 1) {
  const zeroRows = melodee.filter((b) => (Number(b.amount) || 0) === 0);
  for (const row of zeroRows) {
    await del(token, "bills", row.id);
    console.log(`Deleted duplicate bill ${row.id} (${row.name}, $0)`);
  }
} else {
  console.log("No Melodee duplicate to remove");
}

console.log("Done.");
