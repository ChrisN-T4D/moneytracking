/**
 * Parse statement CSV and map columns to StatementRecord fields.
 * Supports:
 * 1. Wells Fargo activity export (no header): Date, Amount, *, "", Description — full history CSV.
 * 2. Header-based CSV: first row = headers. Common column names: Date, Description, Amount, Balance, Memo, Category.
 *    Amount can be one column (negative = debit) or separate Debit/Credit columns.
 */

export interface StatementRow {
  date: string;
  description: string;
  amount: number;
  balance?: number;
  category?: string;
  account?: string;
  sourceFile?: string;
}

/** Parse a single CSV line (handles quoted fields with commas). */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      result.push(current.replace(/^"|"$/g, "").trim());
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current.replace(/^"|"$/g, "").trim());
  return result;
}

/** Normalize header name for matching (lowercase, no spaces). */
function norm(h: string): string {
  return h.toLowerCase().replace(/\s+/g, "");
}

/** Find column index by possible header names. */
function findCol(headers: string[], names: string[]): number {
  const normalized = headers.map((h) => norm(h));
  for (const name of names) {
    const n = norm(name);
    const i = normalized.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

/** Parse numeric value from CSV cell (removes $ and commas). Keeps sign. */
function parseNum(s: string): number {
  if (!s || s.trim() === "") return 0;
  const cleaned = s.replace(/[$,]/g, "").trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** True if first line looks like Wells Fargo activity export: "MM/DD/YYYY","±amount","*","","description" */
function isWellsFargoActivityFormat(firstLine: string): boolean {
  const cells = parseCsvLine(firstLine);
  if (cells.length < 5) return false;
  const date = (cells[0] ?? "").trim();
  const amountStr = (cells[1] ?? "").trim();
  const desc = (cells[4] ?? "").trim();
  if (!desc) return false;
  if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) return false;
  if (!/^-?\d+\.?\d*$/.test(amountStr)) return false;
  return true;
}

/** Convert MM/DD/YYYY or M/D/YY to YYYY-MM-DD for consistent storage. */
export function toIsoDate(s: string): string {
  const t = s.trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, month, day, year] = m;
    return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  }
  const m2 = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m2) {
    const [, month, day, yy] = m2;
    const y = Number.parseInt(yy!, 10);
    const year = y >= 50 ? 1900 + y : 2000 + y;
    return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return s;
}

/** Parse Wells Fargo activity CSV (no header). Columns: Date, Amount, *, "", Description. */
function parseWellsFargoActivityCsv(
  lines: string[],
  options?: { account?: string; sourceFile?: string }
): StatementRow[] {
  const rows: StatementRow[] = [];
  for (const line of lines) {
    const cells = parseCsvLine(line);
    if (cells.length < 5) continue;
    const dateRaw = (cells[0] ?? "").trim();
    const amountStr = (cells[1] ?? "").trim();
    const description = (cells[4] ?? "").trim();
    if (!dateRaw || !description) continue;
    const amount = parseNum(amountStr);
    rows.push({
      date: toIsoDate(dateRaw),
      description,
      amount,
      account: options?.account,
      sourceFile: options?.sourceFile,
    });
  }
  return rows;
}

/**
 * Parse CSV text into statement rows.
 * Auto-detects Wells Fargo activity export (no header) or uses first row as headers.
 * Optionally pass account and sourceFile to attach to every row.
 */
export function parseStatementCsv(
  csvText: string,
  options?: { account?: string; sourceFile?: string }
): StatementRow[] {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  if (lines.length >= 1 && isWellsFargoActivityFormat(firstLine)) {
    return parseWellsFargoActivityCsv(lines, options);
  }

  if (lines.length < 2) return [];

  const headerLine = firstLine;
  const headers = parseCsvLine(headerLine);
  const dateCol = findCol(headers, ["date", "transaction date", "posting date", "trans date"]);
  const descCol = findCol(headers, ["description", "memo", "payee", "details", "name"]);
  const amountCol = findCol(headers, ["amount", "transaction amount"]);
  const debitCol = findCol(headers, ["debit", "debits"]);
  const creditCol = findCol(headers, ["credit", "credits"]);
  const balanceCol = findCol(headers, ["balance", "running balance"]);
  const categoryCol = findCol(headers, ["category", "type"]);

  const rows: StatementRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length < 2) continue;

    const date = dateCol >= 0 ? (cells[dateCol] ?? "").trim() : "";
    const description = descCol >= 0 ? (cells[descCol] ?? "").trim() : cells[1] ?? "";
    let amount = 0;
    if (amountCol >= 0) {
      amount = parseNum(cells[amountCol] ?? "");
    } else if (debitCol >= 0 || creditCol >= 0) {
      const debit = debitCol >= 0 ? parseNum(cells[debitCol] ?? "") : 0;
      const credit = creditCol >= 0 ? parseNum(cells[creditCol] ?? "") : 0;
      amount = credit - debit;
    }
    const balance = balanceCol >= 0 ? parseNum(cells[balanceCol] ?? "") : undefined;
    const category = categoryCol >= 0 ? (cells[categoryCol] ?? "").trim() || undefined : undefined;

    rows.push({
      date: date ? toIsoDate(date) : "Unknown",
      description: description || "—",
      amount,
      balance,
      category,
      account: options?.account,
      sourceFile: options?.sourceFile,
    });
  }
  return rows;
}
