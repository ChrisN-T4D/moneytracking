/** Client-side helpers for /api/bills* routes (always sends session cookie). */

export async function billsApiFetch(url: string, init?: RequestInit) {
  return fetch(url, { credentials: "include", ...init });
}

export async function billsApiErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const data = JSON.parse(text) as { message?: string };
    if (data.message) return data.message;
  } catch {
    /* not JSON */
  }
  return text.trim() || `Request failed (${res.status})`;
}

/** PATCH a bill by id or grouped section update-by-name URL. */
export function billPatchUrl(
  item: { id: string; name: string },
  section?: { account: string; listType: string }
): string {
  const isGrouped = item.id.startsWith("group-");
  if (isGrouped && section) {
    return `/api/bills/update-by-name?name=${encodeURIComponent(item.name)}&account=${encodeURIComponent(section.account)}&listType=${encodeURIComponent(section.listType)}`;
  }
  if (isGrouped) {
    return `/api/bills/clear-due?name=${encodeURIComponent(item.name)}`;
  }
  return `/api/bills/${item.id}`;
}

/** PATCH one-paycheck amount override by bill name + account, or by PocketBase record ids. */
export async function savePaycheckAmountOverride(opts: {
  name: string;
  account: string;
  nextPaydayYmd: string;
  amount: number | null;
  listType?: string;
  billIds?: string[];
  collection?: "bills" | "spanish_fork_bills";
}): Promise<{ ok: boolean; message?: string }> {
  const res = await billsApiFetch("/api/bills/paycheck-amount-override", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
  if (!res.ok || data.ok === false) {
    return { ok: false, message: data.message ?? (await billsApiErrorMessage(res)) };
  }
  return { ok: true };
}

/** Same routing as billPatchUrl (date edits use PATCH). */
export const billDatePatchUrl = billPatchUrl;

/** DELETE a bill by id or grouped delete-by-name URL. */
export function billDeleteUrl(
  item: { id: string; name: string },
  section?: { account: string; listType: string }
): string {
  const isGrouped = item.id.startsWith("group-");
  if (isGrouped && section) {
    return `/api/bills/delete-by-name?name=${encodeURIComponent(item.name)}&account=${encodeURIComponent(section.account)}&listType=${encodeURIComponent(section.listType)}`;
  }
  return `/api/bills/${item.id}`;
}
