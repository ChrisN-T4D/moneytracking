/**
 * PocketBase setup: create collections (schema) and seed records.
 * Used by /api/setup-pocketbase and optionally by a CLI script.
 * Requires admin auth (POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD).
 */

import {
  initialSummary,
  billsAccountBills,
  billsAccountSubs,
  checkingAccountBills,
  checkingAccountSubs,
  autoTransfers,
  spanishForkBills,
  goals,
} from "./data";

const textField = (name: string, required: boolean) => ({
  name,
  type: "text" as const,
  required,
});
const numberField = (name: string, required: boolean) => ({
  name,
  type: "number" as const,
  required,
});
const boolField = (name: string, required: boolean) => ({
  name,
  type: "bool" as const,
  required,
});

const baseRules = {
  type: "base" as const,
  listRule: null as string | null,
  viewRule: null as string | null,
  createRule: "" as string,
  updateRule: "" as string,
  deleteRule: null as string | null,
};

export interface SetupOptions {
  baseUrl: string;
  adminEmail: string;
  adminPassword: string;
  /** If true, skip creating collections (only seed). Use when collections already exist. */
  seedOnly?: boolean;
}

export interface SetupResult {
  ok: boolean;
  message: string;
  createdCollections?: string[];
  seeded?: Record<string, number>;
  error?: string;
}

/** Try GET /api/health at a base URL. Returns true if 200. */
async function probeHealth(base: string): Promise<boolean> {
  const url = `${base.replace(/\/$/, "")}/api/health`;
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Discover which base URL has the PocketBase API (try /api/health).
 *  Always returns the root API base (strips /_ so callers use /api/... not /_/api/...). */
async function discoverApiBase(baseUrl: string): Promise<string | null> {
  const base = baseUrl.replace(/\/$/, "");
  // Normalise: strip /_  to get the real root (/_/ is the admin UI, not the API base)
  const root = base.replace(/\/_\/?$/, "");
  const candidates = [root, `${root}/_`];
  for (const b of candidates) {
    if (await probeHealth(b)) {
      // Always return root, not the /_  variant – PocketBase API is at root/api/…
      return root;
    }
  }
  return null;
}

/** Try admin auth at /api/admins/auth-with-password. Returns token or throws. */
async function getAdminTokenAt(
  base: string,
  email: string,
  password: string
): Promise<string> {
  const url = `${base.replace(/\/$/, "")}/api/admins/auth-with-password`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Admin auth failed: ${res.status} ${err}`);
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

/** Try superuser auth at /api/collections/_superusers/auth-with-password (what the Admin UI uses). */
async function getSuperuserTokenAt(
  base: string,
  email: string,
  password: string
): Promise<string> {
  const url = `${base.replace(/\/$/, "")}/api/collections/_superusers/auth-with-password`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Superuser auth failed: ${res.status} ${err}`);
  }
  const data = (await res.json()) as { token?: string; record?: { token?: string } };
  const token = data.token ?? data.record?.token;
  if (!token) throw new Error("Superuser auth: no token in response.");
  return token;
}

/** Get admin/superuser token from PocketBase. Tries /api/admins first, then /api/collections/_superusers (Admin UI endpoint).
 *  Always returns baseUrl stripped of any /_ suffix so callers use root/api/… paths. */
export async function getAdminToken(
  baseUrl: string,
  email: string,
  password: string
): Promise<{ token: string; baseUrl: string }> {
  const base = baseUrl.replace(/\/$/, "").replace(/\/_\/?$/, "");
  const discovered = await discoverApiBase(base);
  // discoverApiBase always returns root (no /_); fallback: try root itself
  const tryBases = discovered ? [discovered] : [base, `${base}/_`];

  for (const b of tryBases) {
    // Always use root API base — strip /_ even in fallback candidates
    const apiBase = b.replace(/\/$/, "").replace(/\/_\/?$/, "");

    try {
      const token = await getAdminTokenAt(apiBase, email, password);
      return { token, baseUrl: apiBase };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      if (!errMsg.includes("404")) throw e;
    }

    try {
      const token = await getSuperuserTokenAt(apiBase, email, password);
      return { token, baseUrl: apiBase };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      if (!errMsg.includes("404")) throw e;
    }
  }

  throw new Error(
    "Admin auth failed (404 on both /api/admins and /api/collections/_superusers). Check proxy forwards both paths."
  );
}

/** Create a single collection via Admin API. Idempotent: 400 "already exists" is ignored. */
async function createCollection(
  baseUrl: string,
  token: string,
  payload: { name: string; type: "base"; listRule: string | null; viewRule: string | null; createRule: string; updateRule: string; deleteRule: string | null; fields: unknown[] }
): Promise<{ created: boolean }> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/collections`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 400 || res.status === 409) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    const msg = String(err?.message || "").toLowerCase();
    if (msg.includes("already exists") || msg.includes("unique") || res.status === 409) {
      return { created: false };
    }
    throw new Error(`Create collection ${payload.name}: ${res.status} ${err?.message ?? ""}`);
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Create collection ${payload.name}: ${res.status} ${errText}`);
  }
  return { created: true };
}

/** Create all app collections. */
export async function createCollections(
  baseUrl: string,
  token: string
): Promise<string[]> {
  const created: string[] = [];

  const collections: Array<{ name: string; fields: unknown[] }> = [
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
        boolField("inThisPaycheck", true),
        numberField("amount", true),
        textField("autoTransferNote", false),
        textField("account", true),
        textField("listType", true),
        textField("subsection", false),
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
      ],
    },
    {
      name: "spanish_fork_bills",
      fields: [
        textField("name", true),
        textField("frequency", true),
        textField("nextDue", true),
        boolField("inThisPaycheck", true),
        numberField("amount", true),
        boolField("tenantPaid", false),
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
        textField("anchorDate", false),
        numberField("dayOfMonth", false),
        numberField("amount", false),
        textField("paidThisMonthYearMonth", false),
        numberField("amountPaidThisMonth", false),
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
        textField("goalId", false),
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
      ],
    },
  ];

  for (const col of collections) {
    const { created: c } = await createCollection(baseUrl, token, {
      ...baseRules,
      name: col.name,
      fields: col.fields,
    });
    if (c) created.push(col.name);
  }

  // user_preferences: relation to users + theme (JSON), auth rules so user can only access own record
  const userPrefsCreated = await createUserPreferencesCollection(baseUrl, token);
  if (userPrefsCreated) created.push("user_preferences");

  return created;
}

/** Get the id of the built-in users collection. */
async function getUsersCollectionId(baseUrl: string, token: string): Promise<string | null> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/collections`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { items?: Array<{ id: string; name: string }> };
  const users = data.items?.find((c) => c.name === "users");
  return users?.id ?? null;
}

/** Create user_preferences collection (user relation + theme JSON). Requires users collection to exist. */
async function createUserPreferencesCollection(
  baseUrl: string,
  token: string
): Promise<boolean> {
  const usersId = await getUsersCollectionId(baseUrl, token);
  if (!usersId) return false;

  const authRule = "user = @request.auth.id";
  const payload = {
    ...baseRules,
    name: "user_preferences",
    listRule: authRule,
    viewRule: authRule,
    createRule: authRule,
    updateRule: authRule,
    deleteRule: authRule,
    fields: [
      { name: "user", type: "relation", required: true, options: { collectionId: usersId, maxSelect: 1, cascadeDelete: true } },
      { name: "theme", type: "json", required: false },
    ],
  };

  const { created } = await createCollection(baseUrl, token, payload);
  return created;
}

/** Default section records (match current app order). */
const defaultSections = [
  { sortOrder: 0, type: "bills_list", title: "Bills (Bills Account)", subtitle: "Oklahoma bills", account: "bills_account", listType: "bills" },
  { sortOrder: 1, type: "bills_list", title: "Subscriptions (Bills Account)", subtitle: "", account: "bills_account", listType: "subscriptions" },
  { sortOrder: 2, type: "bills_list", title: "Bills (Checking Account)", subtitle: "Checking bills", account: "checking_account", listType: "bills" },
  { sortOrder: 3, type: "bills_list", title: "Subscriptions (Checking Account)", subtitle: "", account: "checking_account", listType: "subscriptions" },
  { sortOrder: 4, type: "spanish_fork", title: "Spanish Fork (Rental)", subtitle: "Bills with tenant paid amounts", account: "", listType: "" },
  { sortOrder: 5, type: "auto_transfers", title: "Auto transfers", subtitle: "Money moved between accounts to cover what we need (e.g. to Bills account, Spanish Fork account). Fun money isn't tracked here.", account: "", listType: "" },
];

/** Seed all collections with data from lib/data.ts. */
export async function seedData(
  baseUrl: string,
  token: string
): Promise<Record<string, number>> {
  const base = baseUrl.replace(/\/$/, "");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const counts: Record<string, number> = {};

  const postRecords = async (collection: string, records: Record<string, unknown>[]) => {
    let n = 0;
    for (const record of records) {
      const res = await fetch(`${base}/api/collections/${collection}/records`, {
        method: "POST",
        headers,
        body: JSON.stringify(record),
      });
      if (res.ok) n++;
      // 400 duplicate etc. could be skipped or logged
    }
    counts[collection] = n;
  };

  await postRecords("sections", defaultSections);

  const billsRecords = [
    ...billsAccountBills.map((b) => ({ ...b, account: "bills_account", listType: "bills" as const })),
    ...billsAccountSubs.map((b) => ({ ...b, account: "bills_account", listType: "subscriptions" as const })),
    ...checkingAccountBills.map((b) => ({ ...b, account: "checking_account", listType: "bills" as const })),
    ...checkingAccountSubs.map((b) => ({ ...b, account: "checking_account", listType: "subscriptions" as const })),
  ].map(({ id: _id, ...r }) => r);

  await postRecords("bills", billsRecords);
  await postRecords(
    "auto_transfers",
    autoTransfers.map(({ id: _id, ...r }) => r)
  );
  await postRecords(
    "spanish_fork_bills",
    spanishForkBills.map(({ id: _id, ...r }) => r)
  );
  await postRecords("summary", [
    {
      monthlyTotal: initialSummary.monthlyTotal,
      totalNeeded: initialSummary.totalNeeded,
      billsAccountNeeded: initialSummary.billsAccountNeeded,
      checkingAccountNeeded: initialSummary.checkingAccountNeeded,
      spanishForkNeeded: initialSummary.spanishForkNeeded,
      billsSubscriptions: initialSummary.billsSubscriptions,
      checkingSubscriptions: initialSummary.checkingSubscriptions,
      leftOver: initialSummary.leftOver,
      leftOverPerPaycheck: initialSummary.leftOverPerPaycheck,
      planToFamily: initialSummary.planToFamily,
    },
  ]);

  await postRecords(
    "goals",
    goals.map(({ id: _id, ...g }) => g)
  );

  await postRecords(
    "goals",
    goals.map(({ id: _id, ...g }) => g)
  );

  return counts;
}

/** Result of public seed: counts per collection and optional first error for debugging. */
export interface SeedDataPublicResult {
  counts: Record<string, number>;
  /** First non-OK response (e.g. 403) so we can show why creates failed. */
  firstError?: { collection: string; status: number; body: string };
}

/** Seed all collections via public API (no admin token). Use when host blocks admin API.
 * Collections must already exist and have Create rule that allows the request (e.g. "true"). */
export async function seedDataPublic(baseUrl: string): Promise<SeedDataPublicResult> {
  const base = baseUrl.replace(/\/$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const counts: Record<string, number> = {};
  let firstError: { collection: string; status: number; body: string } | undefined;

  const postRecords = async (collection: string, records: Record<string, unknown>[]) => {
    let n = 0;
    for (const record of records) {
      const res = await fetch(`${base}/api/collections/${collection}/records`, {
        method: "POST",
        headers,
        body: JSON.stringify(record),
      });
      if (res.ok) {
        n++;
      } else if (!firstError) {
        firstError = { collection, status: res.status, body: await res.text() };
      }
    }
    counts[collection] = n;
  };

  await postRecords("sections", defaultSections);

  const billsRecords = [
    ...billsAccountBills.map((b) => ({ ...b, account: "bills_account", listType: "bills" as const })),
    ...billsAccountSubs.map((b) => ({ ...b, account: "bills_account", listType: "subscriptions" as const })),
    ...checkingAccountBills.map((b) => ({ ...b, account: "checking_account", listType: "bills" as const })),
    ...checkingAccountSubs.map((b) => ({ ...b, account: "checking_account", listType: "subscriptions" as const })),
  ].map(({ id: _id, ...r }) => r);

  await postRecords("bills", billsRecords);
  await postRecords(
    "auto_transfers",
    autoTransfers.map(({ id: _id, ...r }) => r)
  );
  await postRecords(
    "spanish_fork_bills",
    spanishForkBills.map(({ id: _id, ...r }) => r)
  );
  await postRecords("summary", [
    {
      monthlyTotal: initialSummary.monthlyTotal,
      totalNeeded: initialSummary.totalNeeded,
      billsAccountNeeded: initialSummary.billsAccountNeeded,
      checkingAccountNeeded: initialSummary.checkingAccountNeeded,
      spanishForkNeeded: initialSummary.spanishForkNeeded,
      billsSubscriptions: initialSummary.billsSubscriptions,
      checkingSubscriptions: initialSummary.checkingSubscriptions,
      leftOver: initialSummary.leftOver,
      leftOverPerPaycheck: initialSummary.leftOverPerPaycheck,
      planToFamily: initialSummary.planToFamily,
    },
  ]);

  await postRecords(
    "goals",
    goals.map(({ id: _id, ...g }) => g)
  );

  return { counts, firstError };
}

/** Seed only, no admin auth. Discovers API base via /api/health then POSTs records.
 * Use when your host blocks the admin API. Collections must exist and allow create. */
export async function runSeedOnlyPublic(baseUrl: string): Promise<SetupResult> {
  const base = baseUrl.replace(/\/$/, "");
  if (!base) return { ok: false, message: "Missing baseUrl." };
  try {
    const apiBase = await discoverApiBase(base);
    if (!apiBase) {
      return { ok: false, message: "Could not find PocketBase API (GET /api/health returned 404 for both base URLs)." };
    }
    const { counts: seeded, firstError } = await seedDataPublic(apiBase);
    const total = Object.values(seeded).reduce((a, b) => a + b, 0);
    if (total === 0) {
      const is403Superuser =
        firstError?.status === 403 &&
        String(firstError?.body || "").toLowerCase().includes("superuser");
      const hint = is403Superuser
        ? " Your collections only allow superusers to create. Use the main form above with your admin email/password and check \"Seed only\" to seed with your superuser account."
        : firstError
          ? ` First error: ${firstError.collection} → ${firstError.status} ${firstError.body.slice(0, 200)}.`
          : "";
      return {
        ok: false,
        message: `No records were created (0 inserted).${hint}`,
        error: firstError ? `${firstError.status} ${firstError.body}` : undefined,
        seeded,
      };
    }
    return { ok: true, message: `Seeded successfully (${total} records).`, seeded };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, message: "Seed failed.", error };
  }
}

/** Run full setup: auth, create collections (unless seedOnly), seed. */
export async function runSetup(options: SetupOptions): Promise<SetupResult> {
  const { baseUrl, adminEmail, adminPassword, seedOnly } = options;
  const base = baseUrl.replace(/\/$/, "");
  if (!base || !adminEmail || !adminPassword) {
    return { ok: false, message: "Missing baseUrl, adminEmail, or adminPassword." };
  }
  try {
    const { token, baseUrl: resolvedBase } = await getAdminToken(base, adminEmail, adminPassword);
    const apiBase = resolvedBase.replace(/\/$/, "");
    let createdCollections: string[] = [];
    if (!seedOnly) {
      createdCollections = await createCollections(apiBase, token);
    }
    const seeded = await seedData(apiBase, token);
    return {
      ok: true,
      message: seedOnly ? "Seeded successfully." : "Collections created and seeded.",
      createdCollections,
      seeded,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, message: "Setup failed.", error };
  }
}
