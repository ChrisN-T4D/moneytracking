import type { PaycheckConfig } from "./types";

const POCKETBASE_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "";

export interface PaychecksResponse {
  items: Array<{
    id: string;
    name?: string;
    frequency?: string;
    anchorDate?: string;
    dayOfMonth?: number;
    amount?: number;
  }>;
  totalItems: number;
  page: number;
  perPage: number;
}

/** Fetch paychecks from PocketBase. Returns empty array if URL not set or request fails. */
export async function getPaychecks(): Promise<PaycheckConfig[]> {
  if (!POCKETBASE_URL) return [];
  try {
    const res = await fetch(
      `${POCKETBASE_URL.replace(/\/$/, "")}/api/collections/paychecks/records`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as PaychecksResponse;
    return (data.items ?? []).map((item) => {
      const freq = item.frequency as string;
      const frequency: PaycheckConfig["frequency"] =
        freq === "monthlyLastWorkingDay"
          ? "monthlyLastWorkingDay"
          : freq === "monthly"
            ? "monthly"
            : "biweekly";
      return {
        id: item.id,
        name: item.name ?? "",
        frequency,
        anchorDate: item.anchorDate ?? null,
        dayOfMonth: item.dayOfMonth ?? null,
        amount: item.amount ?? null,
      };
    });
  } catch {
    return [];
  }
}
