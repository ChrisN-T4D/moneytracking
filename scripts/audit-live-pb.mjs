#!/usr/bin/env node
/**
 * One-off live audit against PocketBase (run on neu1 or with env set).
 * Usage: PB_URL=... PB_EMAIL=... PB_PASSWORD=... node scripts/audit-live-pb.mjs
 */
const PB = (process.env.PB_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || "").replace(/\/$/, "");
const EMAIL = process.env.PB_EMAIL || process.env.POCKETBASE_ADMIN_EMAIL || "";
const PASS = process.env.PB_PASSWORD || process.env.POCKETBASE_ADMIN_PASSWORD || "";

if (!PB || !EMAIL || !PASS) {
  console.error("Set PB_URL, PB_EMAIL, PB_PASSWORD");
  process.exit(1);
}

async function auth() {
  const body = JSON.stringify({ identity: EMAIL, password: PASS });
  const headers = { "Content-Type": "application/json" };
  for (const path of [
    "/api/admins/auth-with-password",
    "/api/collections/_superusers/auth-with-password",
  ]) {
    const res = await fetch(`${PB}${path}`, { method: "POST", headers, body });
    if (res.ok) {
      const data = await res.json();
      if (data.token) return data.token;
    }
  }
  throw new Error("auth failed (tried admins + _superusers)");
}

async function list(token, collection, perPage = 500) {
  const res = await fetch(`${PB}/api/collections/${collection}/records?perPage=${perPage}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${collection} ${res.status}`);
  const data = await res.json();
  return data.items ?? [];
}

function normName(n) {
  return (n ?? "").toLowerCase().trim().replace(/\s+/g, "").replace(/&/g, "");
}

function monthlyEq(amount, freq) {
  const f = (freq ?? "").toLowerCase();
  const is2W = f.includes("2") && (f.includes("week") || f.includes("wk"));
  if (is2W) return amount * 2;
  if (f.includes("year")) return amount / 12;
  return amount;
}

function paycheckKey(account, name) {
  return `${account}|${normName(name)}`;
}

const token = await auth();
const [summary, bills, sf, paychecks, goals, transfers] = await Promise.all([
  list(token, "summary", 5),
  list(token, "bills"),
  list(token, "spanish_fork_bills"),
  list(token, "paychecks"),
  list(token, "goals"),
  list(token, "auto_transfers"),
]);

console.log(`\n(auto_transfers fetched: ${transfers.length} records)`);

const s = summary[0] ?? {};
console.log("=== SUMMARY ===");
console.log(JSON.stringify({
  checkingBalance: s.checkingBalance,
  billsBalance: s.billsBalance,
  spanishForkBalance: s.spanishForkBalance,
  spanishForkTenantRentMonthly: s.spanishForkTenantRentMonthly,
}, null, 2));

console.log("\n=== PAYCHECKS ===");
for (const p of paychecks) {
  console.log(`  ${p.name}: ${p.frequency} anchor=${p.anchordate ?? p.anchorDate ?? "-"} amount=${p.amount}`);
}

// Duplicate detection for monthly need
const byAcctName = new Map();
for (const b of bills) {
  const k = `${b.account}|${normName(b.name)}`;
  const prev = byAcctName.get(k) ?? [];
  prev.push(b);
  byAcctName.set(k, prev);
}
const dupes = [...byAcctName.entries()].filter(([, rows]) => rows.length > 1);
console.log(`\n=== BILL DUPLICATES (same account+normalized name): ${dupes.length} ===`);
for (const [k, rows] of dupes) {
  const totalRaw = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalMo = rows.reduce((s, r) => s + monthlyEq(Number(r.amount) || 0, r.frequency), 0);
  console.log(`  ${k}: ${rows.length} rows, raw sum=${totalRaw.toFixed(2)}, monthlyEq=${totalMo.toFixed(2)}`);
  for (const r of rows) {
    console.log(`    - id=${r.id} list=${r.listType} amt=${r.amount} freq=${r.frequency} nextDue=${r.nextDue} inPay=${r.inThisPaycheck} paidCycle=${r.recurringPaidCycle ?? ""}`);
  }
}

// Monthly need raw vs merged
let billsMoRaw = 0, checkingMoRaw = 0;
const mergedPaycheck = new Map();
for (const b of bills) {
  const m = monthlyEq(Number(b.amount) || 0, b.frequency);
  if (b.account === "bills_account") billsMoRaw += m;
  else if (b.account === "checking_account") checkingMoRaw += m;
  const pk = paycheckKey(b.account, b.name);
  mergedPaycheck.set(pk, (mergedPaycheck.get(pk) ?? 0) + (Number(b.amount) || 0));
}
const sfGross = sf.reduce((s, b) => s + monthlyEq(Number(b.amount) || 0, b.frequency), 0);
const tenantRent = Number(s.spanishForkTenantRentMonthly) || 0;

console.log("\n=== MONTHLY NEED (predictedNeed style) ===");
console.log(`  bills_account raw (no dedupe): ${billsMoRaw.toFixed(2)}`);
console.log(`  checking_account raw: ${checkingMoRaw.toFixed(2)}`);
console.log(`  spanish_fork gross: ${sfGross.toFixed(2)}`);
console.log(`  spanish_fork net (minus tenant ${tenantRent}): ${Math.max(0, sfGross - tenantRent).toFixed(2)}`);

// Paycheck required style (merged, inThisPaycheck from PB field - note server recomputes)
let reqBills = 0, reqChecking = 0, reqSf = 0;
for (const b of bills) {
  if (!b.inThisPaycheck) continue;
  const pk = paycheckKey(b.account, b.name);
  if (!mergedPaycheck.has(pk)) continue;
  // only count once per pk
  if (mergedPaycheck.get(pk + "_counted")) continue;
  mergedPaycheck.set(pk + "_counted", true);
  const amt = mergedPaycheck.get(pk);
  if (b.account === "bills_account") reqBills += amt;
  else if (b.account === "checking_account") reqChecking += amt;
}
for (const b of sf) {
  if (b.inThisPaycheck) reqSf += Number(b.amount) || 0;
}
console.log("\n=== PAYCHECK REQUIRED (PB inThisPaycheck flag, merged names) ===");
console.log(`  bills: ${reqBills.toFixed(2)}`);
console.log(`  checking: ${reqChecking.toFixed(2)}`);
console.log(`  spanish_fork GROSS (no tenant offset): ${reqSf.toFixed(2)}`);
console.log(`  spanish_fork NET would be: ${Math.max(0, reqSf - tenantRent).toFixed(2)}`);

console.log("\n=== GOALS ===");
for (const g of goals) {
  console.log(`  ${g.name}: current=${g.currentAmount} target=${g.targetAmount} monthly=${g.monthlyContribution ?? 0} cat=${g.category ?? ""}`);
}

// Bills due this paycheck (detail)
console.log("\n=== IN THIS PAYCHECK (PB flag) ===");
const inPay = bills.filter((b) => b.inThisPaycheck);
const inPaySf = sf.filter((b) => b.inThisPaycheck);
const groupInPay = new Map();
for (const b of inPay) {
  const pk = paycheckKey(b.account, b.name);
  groupInPay.set(pk, (groupInPay.get(pk) ?? 0) + (Number(b.amount) || 0));
}
for (const [k, amt] of [...groupInPay.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${amt.toFixed(2)}`);
}
for (const b of inPaySf) {
  console.log(`  spanish_fork|${normName(b.name)}: ${Number(b.amount).toFixed(2)} nextDue=${b.nextDue}`);
}

// Check-in projection (mirror RecurringTab)
const checkingBal = Number(s.checkingBalance);
const billsBal = Number(s.billsBalance);
const sfBal = Number(s.spanishForkBalance);
console.log("\n=== CHECK-IN SNAPSHOT (stored balances vs required) ===");
console.log(`  Checking: balance=${checkingBal} required=${reqChecking.toFixed(2)} ${checkingBal >= reqChecking ? "OK" : "SHORT"}`);
console.log(`  Bills: balance=${billsBal} required=${reqBills.toFixed(2)} ${billsBal >= reqBills ? "OK" : "SHORT"}`);
console.log(`  Spanish Fork: balance=${sfBal} required=${reqSf.toFixed(2)} (gross) ${sfBal >= reqSf ? "OK" : "SHORT"}`);
console.log(`  Spanish Fork NET required=${Math.max(0, reqSf - tenantRent).toFixed(2)} ${sfBal >= Math.max(0, reqSf - tenantRent) ? "OK" : "SHORT"}`);

let outMo = 0;
for (const t of transfers) {
  outMo += monthlyEq(Number(t.amount) || 0, t.frequency);
  console.log(`  ${t.whatFor}: ${t.amount} ${t.frequency} -> ${t.account} transferredThisCycle=${t.transferred_this_cycle ?? t.transferredThisCycle}`);
}
console.log(`  total monthly-equiv leaving checking: ${outMo.toFixed(2)}`);
