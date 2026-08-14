import { makeStatementPattern } from "@/lib/statementTagging";
import type { StatementRecord } from "@/lib/types";

export type StatementAnalyticsLine = {
  id: string;
  date: string;
  description: string;
  amount: number;
  spendCategory: string | null;
  cadence: string | null;
  sourceFile: string | null;
};

export type CategoryAggregate = { category: string; amount: number; count: number };
export type MerchantAggregate = {
  pattern: string;
  amount: number;
  count: number;
  spendCategory: string | null;
  cadence: string | null;
};

export type StatementAnalytics = {
  byCadence: { cadence: string; amount: number; count: number }[];
  byCategory: CategoryAggregate[];
  byCategoryByCadence: Record<string, CategoryAggregate[]>;
  trends: { month: string; outflow: number; byCadence: Record<string, number> }[];
  topMerchants: MerchantAggregate[];
  topMerchantsByCadence: Record<string, MerchantAggregate[]>;
  newSinceLastImport: { pattern: string; amount: number; count: number }[];
  newSinceLastImportByCadence: Record<string, { pattern: string; amount: number; count: number }[]>;
  lines: StatementAnalyticsLine[];
  uncategorizedCount: number;
  meta: {
    from: string | null;
    to: string | null;
    statementCount: number;
    lastCategorizedAt: string | null;
  };
};

const EXPENSE_CADENCES = ["monthly", "biweekly", "variable"] as const;

type MerchantAggregateState = Omit<MerchantAggregate, "pattern"> & { latestDate: string };

function statementDayYmd(s: StatementRecord): string | null {
  const d = (s.date ?? "").trim();
  if (!d) return null;
  if (d.length >= 10 && d[4] === "-" && /\d{4}-\d{2}-\d{2}/.test(d.slice(0, 10))) {
    return d.slice(0, 10);
  }
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isUncategorizedPositiveIncome(s: StatementRecord): boolean {
  return s.amount > 0 && (!s.spendCategory || !s.cadence);
}

function isExcludedFromExpenseAnalytics(s: StatementRecord): boolean {
  if (isUncategorizedPositiveIncome(s)) return true;
  if (s.cadence === "income" || s.cadence === "transfer") return true;
  if (s.amount >= 0) return true;
  return false;
}

function outflowAmount(s: StatementRecord): number {
  return s.amount < 0 ? Math.abs(s.amount) : 0;
}

function filterStatements(
  statements: StatementRecord[],
  options?: { from?: string; to?: string; account?: string }
): StatementRecord[] {
  let filtered = statements;
  if (options?.account) {
    filtered = filtered.filter((s) => s.account === options.account);
  }
  if (options?.from) {
    const from = options.from.slice(0, 10);
    filtered = filtered.filter((s) => {
      const ymd = statementDayYmd(s);
      return ymd !== null && ymd >= from;
    });
  }
  if (options?.to) {
    const to = options.to.slice(0, 10);
    filtered = filtered.filter((s) => {
      const ymd = statementDayYmd(s);
      return ymd !== null && ymd <= to;
    });
  }
  return filtered;
}

function findLatestSourceFile(statements: StatementRecord[]): string | null {
  const fileToMaxDate = new Map<string, string>();
  for (const s of statements) {
    const file = s.sourceFile?.trim();
    if (!file) continue;
    const ymd = statementDayYmd(s);
    if (!ymd) continue;
    const prev = fileToMaxDate.get(file);
    if (!prev || ymd > prev) fileToMaxDate.set(file, ymd);
  }
  let latestFile: string | null = null;
  let latestDate = "";
  for (const [file, maxDate] of fileToMaxDate) {
    if (maxDate > latestDate) {
      latestDate = maxDate;
      latestFile = file;
    }
  }
  return latestFile;
}

function isPatternNewSinceLastImport(
  pattern: string,
  allStatements: StatementRecord[],
  latestFile: string | null
): boolean {
  if (!latestFile) return false;
  const withPattern = allStatements.filter(
    (s) => makeStatementPattern(s.description ?? "") === pattern
  );
  if (withPattern.length === 0) return false;

  if (withPattern.every((s) => (s.sourceFile ?? "").trim() === latestFile)) {
    return true;
  }

  let earliestYmd = "9999-99-99";
  let earliestInLatest = false;
  for (const s of withPattern) {
    const ymd = statementDayYmd(s);
    if (!ymd) continue;
    if (ymd < earliestYmd) {
      earliestYmd = ymd;
      earliestInLatest = (s.sourceFile ?? "").trim() === latestFile;
    }
  }
  return earliestInLatest;
}

function addMerchantAmount(
  map: Map<string, MerchantAggregateState>,
  pattern: string,
  amount: number,
  statement: StatementRecord,
  ymd: string | null
): void {
  const merchant = map.get(pattern) ?? {
    amount: 0,
    count: 0,
    spendCategory: statement.spendCategory ?? null,
    cadence: statement.cadence ?? null,
    latestDate: ymd ?? "",
  };
  merchant.amount += amount;
  merchant.count += 1;
  if (ymd && ymd >= merchant.latestDate) {
    merchant.latestDate = ymd;
    merchant.spendCategory = statement.spendCategory ?? null;
    merchant.cadence = statement.cadence ?? null;
  }
  map.set(pattern, merchant);
}

function merchantRows(
  map: Map<string, MerchantAggregateState>
): MerchantAggregate[] {
  return [...map.entries()]
    .map(([pattern, { amount, count, spendCategory, cadence }]) => ({
      pattern,
      amount,
      count,
      spendCategory,
      cadence,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export function buildStatementAnalytics(
  statements: StatementRecord[],
  options?: { from?: string; to?: string; account?: string }
): StatementAnalytics {
  const filtered = filterStatements(statements, options);
  const latestSourceFile = findLatestSourceFile(statements);
  const lines = [...filtered]
    .sort((a, b) => {
      const aDate = statementDayYmd(a) ?? a.date ?? "";
      const bDate = statementDayYmd(b) ?? b.date ?? "";
      return bDate.localeCompare(aDate);
    })
    .slice(0, 500)
    .map((s) => ({
      id: s.id,
      date: statementDayYmd(s) ?? s.date,
      description: s.description,
      amount: s.amount,
      spendCategory: s.spendCategory ?? null,
      cadence: s.cadence ?? null,
      sourceFile: s.sourceFile ?? null,
    }));

  const cadenceMap = new Map<string, { amount: number; count: number }>();
  for (const cadence of EXPENSE_CADENCES) {
    cadenceMap.set(cadence, { amount: 0, count: 0 });
  }

  const categoryMap = new Map<string, { amount: number; count: number }>();
  const categoryByCadenceMaps = new Map<string, Map<string, { amount: number; count: number }>>();
  for (const cadence of EXPENSE_CADENCES) {
    categoryByCadenceMaps.set(cadence, new Map());
  }
  const trendMap = new Map<
    string,
    { outflow: number; byCadence: Record<string, number> }
  >();
  const merchantMap = new Map<
    string,
    MerchantAggregateState
  >();
  const merchantByCadenceMaps = new Map<string, Map<string, MerchantAggregateState>>();
  for (const cadence of EXPENSE_CADENCES) {
    merchantByCadenceMaps.set(cadence, new Map());
  }
  const newPatternMap = new Map<string, { amount: number; count: number }>();
  const newPatternByCadenceMaps = new Map<string, Map<string, { amount: number; count: number }>>();
  for (const cadence of EXPENSE_CADENCES) {
    newPatternByCadenceMaps.set(cadence, new Map());
  }

  let uncategorizedCount = 0;
  let lastCategorizedAt: string | null = null;

  for (const s of filtered) {
    if (!s.spendCategory || !s.cadence) {
      uncategorizedCount++;
    }

    if (s.categorizedAt) {
      if (!lastCategorizedAt || s.categorizedAt > lastCategorizedAt) {
        lastCategorizedAt = s.categorizedAt;
      }
    }

    if (isExcludedFromExpenseAnalytics(s)) continue;

    const amt = outflowAmount(s);
    const cadence = s.cadence ?? "variable";
    const category = s.spendCategory ?? "Uncategorized";
    const ymd = statementDayYmd(s);
    const month = ymd ? ymd.slice(0, 7) : null;
    const pattern = makeStatementPattern(s.description ?? "") || "UNKNOWN";

    if (EXPENSE_CADENCES.includes(cadence as (typeof EXPENSE_CADENCES)[number])) {
      const cadenceEntry = cadenceMap.get(cadence)!;
      cadenceEntry.amount += amt;
      cadenceEntry.count += 1;

      const cadenceCategoryMap = categoryByCadenceMaps.get(cadence)!;
      const cadenceCatEntry = cadenceCategoryMap.get(category) ?? { amount: 0, count: 0 };
      cadenceCatEntry.amount += amt;
      cadenceCatEntry.count += 1;
      cadenceCategoryMap.set(category, cadenceCatEntry);
    }

    const catEntry = categoryMap.get(category) ?? { amount: 0, count: 0 };
    catEntry.amount += amt;
    catEntry.count += 1;
    categoryMap.set(category, catEntry);

    if (month) {
      const trend = trendMap.get(month) ?? {
        outflow: 0,
        byCadence: Object.fromEntries(EXPENSE_CADENCES.map((c) => [c, 0])),
      };
      trend.outflow += amt;
      if (EXPENSE_CADENCES.includes(cadence as (typeof EXPENSE_CADENCES)[number])) {
        trend.byCadence[cadence] = (trend.byCadence[cadence] ?? 0) + amt;
      }
      trendMap.set(month, trend);
    }

    addMerchantAmount(merchantMap, pattern, amt, s, ymd);
    if (EXPENSE_CADENCES.includes(cadence as (typeof EXPENSE_CADENCES)[number])) {
      addMerchantAmount(merchantByCadenceMaps.get(cadence)!, pattern, amt, s, ymd);
    }

    if (isPatternNewSinceLastImport(pattern, statements, latestSourceFile)) {
      const newEntry = newPatternMap.get(pattern) ?? { amount: 0, count: 0 };
      newEntry.amount += amt;
      newEntry.count += 1;
      newPatternMap.set(pattern, newEntry);

      if (EXPENSE_CADENCES.includes(cadence as (typeof EXPENSE_CADENCES)[number])) {
        const cadenceNewMap = newPatternByCadenceMaps.get(cadence)!;
        const cadenceNewEntry = cadenceNewMap.get(pattern) ?? { amount: 0, count: 0 };
        cadenceNewEntry.amount += amt;
        cadenceNewEntry.count += 1;
        cadenceNewMap.set(pattern, cadenceNewEntry);
      }
    }
  }

  const byCadence = EXPENSE_CADENCES.map((cadence) => {
    const entry = cadenceMap.get(cadence)!;
    return { cadence, amount: entry.amount, count: entry.count };
  });

  const byCategory = [...categoryMap.entries()]
    .map(([category, { amount, count }]) => ({ category, amount, count }))
    .sort((a, b) => b.amount - a.amount);

  const byCategoryByCadence = Object.fromEntries(
    EXPENSE_CADENCES.map((cadence) => {
      const cadenceCategoryMap = categoryByCadenceMaps.get(cadence)!;
      const rows = [...cadenceCategoryMap.entries()]
        .map(([category, { amount, count }]) => ({ category, amount, count }))
        .sort((a, b) => b.amount - a.amount);
      return [cadence, rows];
    })
  );

  const trends = [...trendMap.entries()]
    .map(([month, { outflow, byCadence: monthCadence }]) => ({
      month,
      outflow,
      byCadence: monthCadence,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const topMerchants = merchantRows(merchantMap);

  const topMerchantsByCadence = Object.fromEntries(
    EXPENSE_CADENCES.map((cadence) => {
      return [cadence, merchantRows(merchantByCadenceMaps.get(cadence)!)];
    })
  );

  const newSinceLastImport = [...newPatternMap.entries()]
    .map(([pattern, { amount, count }]) => ({ pattern, amount, count }))
    .sort((a, b) => b.amount - a.amount);

  const newSinceLastImportByCadence = Object.fromEntries(
    EXPENSE_CADENCES.map((cadence) => {
      const cadenceNewMap = newPatternByCadenceMaps.get(cadence)!;
      const rows = [...cadenceNewMap.entries()]
        .map(([pattern, { amount, count }]) => ({ pattern, amount, count }))
        .sort((a, b) => b.amount - a.amount);
      return [cadence, rows];
    })
  );

  return {
    byCadence,
    byCategory,
    byCategoryByCadence,
    trends,
    topMerchants,
    topMerchantsByCadence,
    newSinceLastImport,
    newSinceLastImportByCadence,
    lines,
    uncategorizedCount,
    meta: {
      from: options?.from?.slice(0, 10) ?? null,
      to: options?.to?.slice(0, 10) ?? null,
      statementCount: filtered.length,
      lastCategorizedAt,
    },
  };
}
