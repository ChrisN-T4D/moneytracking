/**
 * Ensure statement category fields exist on statements and corrections collection exists (admin only).
 */
import { getAdminToken } from "@/lib/pocketbase-setup";

const STATEMENT_CATEGORY_FIELDS = [
  { name: "spendCategory", type: "text", required: false },
  { name: "cadence", type: "text", required: false },
  { name: "categorySource", type: "text", required: false },
  { name: "categoryConfidence", type: "number", required: false },
  { name: "categorizedAt", type: "text", required: false },
  { name: "categoryModel", type: "text", required: false },
] as const;

const CORRECTIONS_COLLECTION = {
  name: "statement_category_corrections",
  type: "base" as const,
  listRule: null as string | null,
  viewRule: null as string | null,
  createRule: "" as string,
  updateRule: "" as string,
  deleteRule: null as string | null,
  fields: [
    { name: "statementId", type: "text", required: true },
    { name: "pattern", type: "text", required: true },
    { name: "fromCategory", type: "text", required: false },
    { name: "toCategory", type: "text", required: true },
    { name: "fromCadence", type: "text", required: false },
    { name: "toCadence", type: "text", required: true },
    { name: "createdAt", type: "text", required: true },
  ],
};

async function ensureFieldsOnCollection(
  apiBase: string,
  adminToken: string,
  collectionName: string
): Promise<void> {
  const base = apiBase.replace(/\/$/, "");
  const getRes = await fetch(`${base}/api/collections/${collectionName}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!getRes.ok) return;

  const col = (await getRes.json()) as { fields?: { name: string }[] };
  const fields = [...(col.fields ?? [])];
  const existing = new Set(fields.map((f) => f.name));
  let changed = false;
  for (const f of STATEMENT_CATEGORY_FIELDS) {
    if (!existing.has(f.name)) {
      fields.push({ ...f });
      changed = true;
    }
  }
  if (!changed) return;

  const patchRes = await fetch(`${base}/api/collections/${collectionName}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ fields }),
  });
  if (!patchRes.ok) {
    const text = await patchRes.text().catch(() => "");
    console.warn(
      `Could not add statement category fields to ${collectionName}: ${patchRes.status} ${text}`
    );
  }
}

async function ensureCorrectionsCollection(apiBase: string, adminToken: string): Promise<void> {
  const base = apiBase.replace(/\/$/, "");
  const getRes = await fetch(`${base}/api/collections/statement_category_corrections`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (getRes.ok) return;

  const postRes = await fetch(`${base}/api/collections`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(CORRECTIONS_COLLECTION),
  });
  if (!postRes.ok && postRes.status !== 400 && postRes.status !== 409) {
    const text = await postRes.text().catch(() => "");
    console.warn(
      `Could not create statement_category_corrections collection: ${postRes.status} ${text}`
    );
  }
}

/** Add category fields to statements and create statement_category_corrections if missing. */
export async function ensureStatementCategoryFields(pbBase: string): Promise<void> {
  const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
  if (!email || !password) return;

  const adminBase =
    (process.env.POCKETBASE_API_URL ?? process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "").trim() || pbBase;
  try {
    const { token, baseUrl } = await getAdminToken(adminBase, email, password);
    await ensureFieldsOnCollection(baseUrl, token, "statements");
    await ensureCorrectionsCollection(baseUrl, token);
  } catch (e) {
    console.warn("ensureStatementCategoryFields:", e);
  }
}
