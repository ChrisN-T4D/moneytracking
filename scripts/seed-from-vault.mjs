#!/usr/bin/env node
/**
 * Seed NMT PocketBase from vault-verified evidence (scripts/seed-from-vault-evidence.md).
 *
 * Usage (on neu1 or locally with env):
 *   PB_URL=https://pbnmt.lab.clneu.com \
 *   PB_EMAIL=... PB_PASSWORD=... \
 *   node scripts/seed-from-vault.mjs
 *
 * Options:
 *   --create-collections  Create app collections via admin API (anchordate field correct)
 *   --clear               Delete existing bills/paychecks/sf/transfers/summary/sections/goals before seed
 *   --create-user         Create users auth record with same email/password as admin
 */
const PB = (process.env.PB_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || "").replace(/\/$/, "");
const EMAIL = process.env.PB_EMAIL || process.env.POCKETBASE_ADMIN_EMAIL || "";
const PASS = process.env.PB_PASSWORD || process.env.POCKETBASE_ADMIN_PASSWORD || "";
const args = new Set(process.argv.slice(2));

if (!PB || !EMAIL || !PASS) {
  console.error("Set PB_URL, PB_EMAIL, PB_PASSWORD");
  process.exit(1);
}

async function auth() {
  const body = JSON.stringify({ identity: EMAIL, password: PASS });
  const headers = { "Content-Type": "application/json" };
  for (const path of [
    "/api/collections/_superusers/auth-with-password",
    "/api/admins/auth-with-password",
  ]) {
    const res = await fetch(`${PB}${path}`, { method: "POST", headers, body });
    if (res.ok) {
      const data = await res.json();
      if (data.token) return data.token;
    }
  }
  throw new Error("auth failed");
}

async function list(token, collection, perPage = 500) {
  const res = await fetch(`${PB}/api/collections/${collection}/records?perPage=${perPage}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`list ${collection}: ${res.status} ${await res.text()}`);
  return (await res.json()).items ?? [];
}

async function delAll(token, collection) {
  const items = await list(token, collection);
  let n = 0;
  for (const it of items) {
    const res = await fetch(`${PB}/api/collections/${collection}/records/${it.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok || res.status === 204) n++;
    else console.warn(`delete ${collection}/${it.id}: ${res.status}`);
  }
  return n;
}

async function post(token, collection, record) {
  const res = await fetch(`${PB}/api/collections/${collection}/records`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`POST ${collection}: ${res.status} ${t} body=${JSON.stringify(record)}`);
  }
  return res.json();
}

/** Evidence-approved seed payload — amounts only from vault YAML/ledger (2026-08-04). */
const SECTIONS = [
  { sortOrder: 1, type: "bills_list", title: "Bills (Bills Account)", subtitle: "Oklahoma bills", account: "bills_account", listType: "bills" },
  { sortOrder: 2, type: "bills_list", title: "Subscriptions (Bills Account)", subtitle: "", account: "bills_account", listType: "subscriptions" },
  { sortOrder: 3, type: "bills_list", title: "Bills (Checking Account)", subtitle: "Checking bills", account: "checking_account", listType: "bills" },
  { sortOrder: 4, type: "bills_list", title: "Subscriptions (Checking Account)", subtitle: "", account: "checking_account", listType: "subscriptions" },
  { sortOrder: 5, type: "spanish_fork", title: "Spanish Fork (Rental)", subtitle: "Bills with tenant paid amounts", account: "", listType: "" },
  { sortOrder: 6, type: "auto_transfers", title: "Auto transfers", subtitle: "Money moved between accounts to cover what we need", account: "", listType: "" },
];

const BILLS = [
  // Oklahoma bills_account
  { name: "Oklahoma Mortgage", frequency: "monthly", nextDue: "2026-08-07", inThisPaycheck: true, amount: 1886.96, account: "bills_account", listType: "bills", autoTransferNote: "debts.yml + ledger 1886.96", isEssential: true },
  { name: "State Farm Auto Insurance", frequency: "monthly", nextDue: "2026-08-15", inThisPaycheck: false, amount: 270.58, account: "bills_account", listType: "bills", autoTransferNote: "ledger Jun+Jul 270.58", isEssential: true },
  { name: "Life Insurance", frequency: "monthly", nextDue: "2026-08-27", inThisPaycheck: true, amount: 226.14, account: "bills_account", listType: "bills", autoTransferNote: "ledger Northwestern Mutual 226.14", isEssential: true },
  { name: "OG & E (Electricity)", frequency: "monthly", nextDue: "2026-08-07", inThisPaycheck: false, amount: 195.41, account: "bills_account", listType: "bills", autoTransferNote: "ledger median last6; varies seasonally", isEssential: true },
  { name: "Oklahoma Natural Gas", frequency: "monthly", nextDue: "2026-08-06", inThisPaycheck: false, amount: 115.69, account: "bills_account", listType: "bills", autoTransferNote: "ledger median last6; seasonal", isEssential: true },
  { name: "Oklahoma City of Enid", frequency: "monthly", nextDue: "2026-08-20", inThisPaycheck: true, amount: 174.05, account: "bills_account", listType: "bills", autoTransferNote: "ledger median last6; varies", isEssential: true },
  { name: "BluePeak (Internet)", frequency: "monthly", nextDue: "2026-08-28", inThisPaycheck: true, amount: 67.94, account: "bills_account", listType: "bills", autoTransferNote: "ledger Mar–Jul 67.94", isEssential: true },
  { name: "Toyota Car Payment", frequency: "monthly", nextDue: "2026-08-14", inThisPaycheck: true, amount: 137.13, account: "bills_account", listType: "bills", autoTransferNote: "debts.yml; paid from Oklahoma envelope", isEssential: true },
  { name: "Spotify", frequency: "monthly", nextDue: "2026-09-02", inThisPaycheck: false, amount: 13.96, account: "bills_account", listType: "subscriptions", autoTransferNote: "ledger 13.96 (paid from SF envelope historically)", isEssential: false },
  // Checking
  { name: "Jeff Neu (family loan)", frequency: "monthly", nextDue: "2026-08-27", inThisPaycheck: true, amount: 100, account: "checking_account", listType: "bills", autoTransferNote: "debts.yml; never on cut list", isEssential: true },
  { name: "Kerrie Neu (family loan)", frequency: "monthly", nextDue: "2026-08-13", inThisPaycheck: true, amount: 100, account: "checking_account", listType: "bills", autoTransferNote: "debts.yml; never on cut list", isEssential: true },
  { name: "Mark Murphy (family loan)", frequency: "2weeks", nextDue: "2026-08-04", inThisPaycheck: true, amount: 50, account: "checking_account", listType: "bills", autoTransferNote: "debts.yml $50 biweekly", isEssential: true },
  { name: "Goldman Sachs (Emergency Savings)", frequency: "2weeks", nextDue: "2026-08-05", inThisPaycheck: true, amount: 100, account: "checking_account", listType: "bills", autoTransferNote: "Marcus drip; ledger 15x $100", isEssential: true },
];

const SF_BILLS = [
  { name: "Spanish Fork Mortgage", frequency: "monthly", nextDue: "2026-08-06", inThisPaycheck: false, amount: 2015.54, tenantPaid: false, isEssential: true },
  { name: "HOA Charge", frequency: "monthly", nextDue: "2026-08-13", inThisPaycheck: false, amount: 220, tenantPaid: false, isEssential: true },
  { name: "Spanish Fork City (small/internet)", frequency: "monthly", nextDue: "2026-08-25", inThisPaycheck: true, amount: 10, tenantPaid: true, isEssential: true },
];

const PAYCHECKS = [
  { name: "Quest Diagnostics", frequency: "biweekly", anchordate: "2026-07-31", amount: 1490.79 },
  { name: "NWOSU", frequency: "monthlyLastWorkingDay", amount: 3403.34 },
];

const TRANSFERS = [
  { whatFor: "Oklahoma Bill Covering", frequency: "Monthly", account: "Oklahoma Bills", date: "8/1/2026", amount: 3400 },
  { whatFor: "Oklahoma Bill Remaining", frequency: "2 Weeks", account: "Oklahoma Bills", date: "7/30/2026", amount: 80 },
  { whatFor: "Spanish Fork Bill Covering", frequency: "2 Weeks", account: "Spanish Fork Bills", date: "7/30/2026", amount: 300 },
  { whatFor: "Subscription Covering", frequency: "2 Weeks", account: "Spanish Fork Bills", date: "7/30/2026", amount: 35 },
  { whatFor: "Fun Money (Chris)", frequency: "2 Weeks", account: "Chris Account", date: "7/30/2026", amount: 100 },
  { whatFor: "Fun Money (Melodee)", frequency: "2 Weeks", account: "Melodee Account", date: "7/30/2026", amount: 100 },
  { whatFor: "Pay Family (Jeff/Kerrie)", frequency: "2 Weeks", account: "Spanish Fork Bills", date: "7/30/2026", amount: 100 },
];

const SUMMARY = {
  spanishForkTenantRentMonthly: 1678.95,
  checkingBalance: 0,
  billsBalance: 0,
  spanishForkBalance: 0,
};

const EXPECTED = {
  "Oklahoma Mortgage": 1886.96,
  "Spanish Fork Mortgage": 2015.54,
  "Toyota Car Payment": 137.13,
  "HOA Charge": 220,
  "Quest Diagnostics": 1490.79,
  NWOSU: 3403.34,
  "State Farm Auto Insurance": 270.58,
  "Life Insurance": 226.14,
  "BluePeak (Internet)": 67.94,
  "Jeff Neu (family loan)": 100,
  "Kerrie Neu (family loan)": 100,
  "Mark Murphy (family loan)": 50,
  "Goldman Sachs (Emergency Savings)": 100,
};

const textField = (name, required) => ({ name, type: "text", required });
const numberField = (name, required) => ({ name, type: "number", required });
const boolField = (name, required) => ({ name, type: "bool", required });

const baseRules = {
  type: "base",
  listRule: '@request.auth.id != ""',
  viewRule: '@request.auth.id != ""',
  createRule: '@request.auth.id != ""',
  updateRule: '@request.auth.id != ""',
  deleteRule: '@request.auth.id != ""',
};

async function createCollection(token, payload) {
  const res = await fetch(`${PB}/api/collections`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 400 || res.status === 409) {
    const err = await res.json().catch(() => ({}));
    const msg = String(err?.message || "").toLowerCase();
    const dataMsg = JSON.stringify(err?.data || {}).toLowerCase();
    if (
      msg.includes("already exists") ||
      msg.includes("unique") ||
      dataMsg.includes("unique") ||
      dataMsg.includes("name_exists") ||
      res.status === 409
    ) {
      console.log("  exists:", payload.name);
      return false;
    }
    throw new Error(`create ${payload.name}: ${res.status} ${JSON.stringify(err)}`);
  }
  if (!res.ok) throw new Error(`create ${payload.name}: ${res.status} ${await res.text()}`);
  console.log("  created:", payload.name);
  return true;
}

async function createCollections(token) {
  // If re-running after a failed seed, drop app collections so schema matches
  // (PB treats required:true bool false as blank — keep bools optional).
  if (args.has("--recreate-collections")) {
    for (const name of [
      "sections",
      "bills",
      "auto_transfers",
      "spanish_fork_bills",
      "summary",
      "paychecks",
      "statements",
      "goals",
      "user_preferences",
    ]) {
      const res = await fetch(`${PB}/api/collections/${name}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log(`  delete ${name}: ${res.status}`);
    }
  }
  const collections = [
    {
      name: "sections",
      fields: [
        numberField("sortOrder", true),
        textField("type", true),
        textField("title", true),
        textField("subtitle", false),
        textField("account", false),
        textField("listType", false),
      ],
    },
    {
      name: "bills",
      fields: [
        textField("name", true),
        textField("frequency", true),
        textField("nextDue", true),
        boolField("inThisPaycheck", false),
        numberField("amount", true),
        textField("autoTransferNote", false),
        textField("account", true),
        textField("listType", true),
        textField("subsection", false),
        textField("recurringPaidCycle", false),
        textField("recurringPaidGoalId", false),
        textField("recurringPaidStatementId", false),
        numberField("paycheckAmountOverride", false),
        textField("paycheckAmountOverrideFor", false),
        boolField("isEssential", false),
      ],
    },
    {
      name: "auto_transfers",
      fields: [
        textField("whatFor", true),
        textField("frequency", true),
        textField("account", true),
        textField("date", true),
        numberField("amount", true),
        boolField("transferredThisCycle", false),
      ],
    },
    {
      name: "spanish_fork_bills",
      fields: [
        textField("name", true),
        textField("frequency", true),
        textField("nextDue", true),
        boolField("inThisPaycheck", false),
        numberField("amount", true),
        boolField("tenantPaid", false),
        textField("recurringPaidCycle", false),
        textField("recurringPaidGoalId", false),
        // Match pbFieldMap quirk: capital ID
        textField("recurringPaidStatementID", false),
        numberField("paycheckAmountOverride", false),
        textField("paycheckAmountOverrideFor", false),
        boolField("isEssential", false),
      ],
    },
    {
      name: "summary",
      fields: [
        numberField("monthlyTotal", false),
        numberField("totalNeeded", false),
        numberField("billsAccountNeeded", false),
        numberField("checkingAccountNeeded", false),
        numberField("spanishForkNeeded", false),
        numberField("billsSubscriptions", false),
        numberField("checkingSubscriptions", false),
        numberField("leftOver", false),
        numberField("leftOverPerPaycheck", false),
        textField("planToFamily", false),
        numberField("checkingBalance", false),
        numberField("billsBalance", false),
        numberField("spanishForkBalance", false),
        numberField("spanishForkTenantRentMonthly", false),
      ],
    },
    {
      name: "paychecks",
      fields: [
        textField("name", true),
        textField("frequency", true),
        // Must be lowercase to match live app pbFieldMap
        textField("anchordate", false),
        numberField("dayOfMonth", false),
        numberField("amount", false),
        textField("paidThisMonthYearMonth", false),
        numberField("amountPaidThisMonth", false),
        textField("fundingMonthPreference", false),
        textField("lastEditedByUserId", false),
        textField("lastEditedBy", false),
        textField("lastEditedAt", false),
      ],
    },
    {
      name: "statements",
      fields: [
        textField("date", true),
        textField("description", true),
        numberField("amount", true),
        numberField("balance", false),
        textField("category", false),
        textField("account", false),
        textField("sourceFile", false),
        textField("goalid", false),
        textField("pairedStatementId", false),
        textField("trasnferFromAccount", false),
        textField("transferToAccount", false),
      ],
    },
    {
      name: "goals",
      fields: [
        textField("name", true),
        numberField("targetAmount", true),
        numberField("currentAmount", true),
        textField("targetDate", false),
        textField("category", false),
        numberField("monthlyContribution", false),
      ],
    },
  ];

  for (const col of collections) {
    await createCollection(token, { ...baseRules, ...col });
  }
}

async function ensureCollections(token) {
  const res = await fetch(`${PB}/api/collections/bills/records?perPage=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) {
    throw new Error("collections missing — re-run with --create-collections");
  }
}

async function createUser(token) {
  // Check existing
  const q = encodeURIComponent(`email="${EMAIL}"`);
  const existing = await fetch(`${PB}/api/collections/users/records?filter=${q}&perPage=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (existing.ok) {
    const data = await existing.json();
    if ((data.items ?? []).length > 0) {
      console.log("user already exists:", EMAIL);
      return data.items[0];
    }
  }
  const res = await fetch(`${PB}/api/collections/users/records`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: EMAIL,
      password: PASS,
      passwordConfirm: PASS,
      emailVisibility: true,
    }),
  });
  if (!res.ok) throw new Error(`create user: ${res.status} ${await res.text()}`);
  console.log("created user:", EMAIL);
  return res.json();
}

async function verify(token) {
  const [bills, sf, paychecks, transfers, summary] = await Promise.all([
    list(token, "bills"),
    list(token, "spanish_fork_bills"),
    list(token, "paychecks"),
    list(token, "auto_transfers"),
    list(token, "summary"),
  ]);
  const byName = new Map();
  for (const b of [...bills, ...sf]) byName.set(b.name, Number(b.amount));
  for (const p of paychecks) byName.set(p.name, Number(p.amount));

  let ok = true;
  console.log("\n=== VERIFY vs evidence ===");
  for (const [name, amt] of Object.entries(EXPECTED)) {
    const got = byName.get(name);
    const match = got !== undefined && Math.abs(got - amt) < 0.005;
    console.log(`${match ? "OK" : "FAIL"}  ${name}: expected ${amt} got ${got}`);
    if (!match) ok = false;
  }
  const q = paychecks.find((p) => p.name === "Quest Diagnostics");
  const anchor = q?.anchordate ?? q?.anchorDate;
  const anchorOk = anchor && String(anchor).startsWith("2026-07-31");
  console.log(`${anchorOk ? "OK" : "FAIL"}  Quest anchordate: ${anchor}`);
  if (!anchorOk) ok = false;

  const rent = summary[0]?.spanishForkTenantRentMonthly;
  const rentOk = Math.abs(Number(rent) - 1678.95) < 0.005;
  console.log(`${rentOk ? "OK" : "FAIL"}  tenant rent net: ${rent}`);
  if (!rentOk) ok = false;

  console.log(`counts: bills=${bills.length} sf=${sf.length} paychecks=${paychecks.length} transfers=${transfers.length}`);
  return ok;
}

async function loginSmoke() {
  const res = await fetch(`${PB}/api/collections/users/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: EMAIL, password: PASS }),
  });
  if (!res.ok) {
    console.error("LOGIN FAIL", res.status, await res.text());
    return false;
  }
  console.log("LOGIN OK");
  return true;
}

const token = await auth();
console.log("authed against", PB);

if (args.has("--create-collections")) {
  console.log("creating collections...");
  await createCollections(token);
}

await ensureCollections(token);

if (args.has("--clear")) {
  for (const col of ["bills", "spanish_fork_bills", "paychecks", "auto_transfers", "summary", "sections", "goals"]) {
    try {
      const n = await delAll(token, col);
      console.log(`cleared ${col}: ${n}`);
    } catch (e) {
      console.warn(`clear ${col}:`, e.message);
    }
  }
}

for (const s of SECTIONS) await post(token, "sections", s);
console.log("sections", SECTIONS.length);

for (const b of BILLS) await post(token, "bills", b);
console.log("bills", BILLS.length);

for (const b of SF_BILLS) await post(token, "spanish_fork_bills", b);
console.log("sf", SF_BILLS.length);

for (const p of PAYCHECKS) await post(token, "paychecks", p);
console.log("paychecks", PAYCHECKS.length);

for (const t of TRANSFERS) await post(token, "auto_transfers", t);
console.log("transfers", TRANSFERS.length);

await post(token, "summary", SUMMARY);
console.log("summary 1");

if (args.has("--create-user")) {
  await createUser(token);
}

const verified = await verify(token);
const loggedIn = args.has("--create-user") ? await loginSmoke() : true;
if (!verified || !loggedIn) process.exit(2);
console.log("\nSEED OK");
