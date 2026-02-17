/**
 * Parse statement CSV and map columns to StatementRecord fields.
 * Expects first row to be headers. Common column names: Date, Description, Amount, Balance, Memo, Category.
 * Amount can be one column (negative = debit) or separate Debit/Credit columns.
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

/** Parse numeric value from CSV cell (removes $ and commas). */
function parseNum(s: string): number {
  if (!s || s.trim() === "") return 0;
  const cleaned = s.replace(/[$,]/g, "").trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parse CSV text into statement rows.
 * First row = headers. Maps: date, description, amount (or debit/credit), balance, memo, category.
 * Optionally pass account and sourceFile to attach to every row.
 */
export function parseStatementCsv(
  csvText: string,
  options?: { account?: string; sourceFile?: string }
): StatementRow[] {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headerLine = lines[0];
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
      date: date || "Unknown",
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
