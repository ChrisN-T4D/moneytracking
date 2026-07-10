/**
 * Ensure paycheck override fields exist on bills collections (admin only).
 */
import { getAdminToken } from "@/lib/pocketbase-setup";

const OVERRIDE_FIELDS = [
  { name: "paycheckAmountOverride", type: "number", required: false },
  { name: "paycheckAmountOverrideFor", type: "text", required: false },
] as const;

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
  for (const f of OVERRIDE_FIELDS) {
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
    console.warn(`Could not add paycheck override fields to ${collectionName}: ${patchRes.status} ${text}`);
  }
}

/** Add paycheckAmountOverride* fields to bills + spanish_fork_bills if missing. */
export async function ensurePaycheckOverrideFields(pbBase: string): Promise<void> {
  const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
  if (!email || !password) return;

  const adminBase =
    (process.env.POCKETBASE_API_URL ?? process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "").trim() || pbBase;
  try {
    const { token, baseUrl } = await getAdminToken(adminBase, email, password);
    await ensureFieldsOnCollection(baseUrl, token, "bills");
    await ensureFieldsOnCollection(baseUrl, token, "spanish_fork_bills");
  } catch (e) {
    console.warn("ensurePaycheckOverrideFields:", e);
  }
}
