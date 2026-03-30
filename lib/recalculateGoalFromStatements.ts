import { PB } from "./pbFieldMap";

/**
 * Sum |amount| of all statements tagged with a goal via the `goalid` field.
 */
async function sumStatementsForGoal(
  goalId: string,
  apiBase: string,
  headers: Record<string, string>
): Promise<number> {
  const base = apiBase.replace(/\/$/, "");
  const field = PB.statements.goalId;
  let total = 0;
  let page = 1;
  const perPage = 500;

  while (true) {
    const filter = encodeURIComponent(`${field}="${goalId}"`);
    const res = await fetch(
      `${base}/api/collections/statements/records?filter=${filter}&perPage=${perPage}&page=${page}&sort=-date`,
      { cache: "no-store", headers }
    );
    if (!res.ok) break;

    const data = (await res.json()) as {
      items?: Array<{ amount?: number }>;
      totalItems?: number;
    };
    const items = data.items ?? [];
    for (const row of items) {
      total += Math.abs(Number(row.amount) || 0);
    }
    if (page * perPage >= (data.totalItems ?? 0) || items.length === 0) break;
    page++;
  }

  return total;
}

/**
 * PATCH goal.currentAmount in PocketBase.
 */
async function patchGoalCurrentAmount(
  goalId: string,
  currentAmount: number,
  apiBase: string,
  headers: Record<string, string>
): Promise<boolean> {
  const url = `${apiBase.replace(/\/$/, "")}/api/collections/goals/records/${goalId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ [PB.goals.currentAmount]: currentAmount }),
    cache: "no-store",
  });
  return res.ok;
}

/**
 * Recompute goal.currentAmount as sum of tagged statements, then PATCH.
 */
export async function syncGoalFromStatements(
  goalId: string,
  apiBase: string,
  headers: Record<string, string>
): Promise<{ ok: boolean; total: number }> {
  const total = await sumStatementsForGoal(goalId, apiBase, headers);
  const ok = await patchGoalCurrentAmount(goalId, total, apiBase, headers);
  return { ok, total };
}
