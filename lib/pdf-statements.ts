/**
 * Parse Wells Fargo statement PDF text into StatementRow format.
 * Tailored to Wells Fargo combined statement PDFs only (transaction history section, M/D dates, amount.XX).
 */

import type { StatementRow } from "./csv-statements";

/** Wells Fargo date: M/D or MM/DD, optional /YY or /YYYY */
const WF_DATE_GLOBAL = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+/g;

/** Dollar amount: digits and .XX (Wells Fargo always uses cents) */
const AMOUNT_CENTS = /[\d,]+\.\d{2}/;

function parseNum(s: string): number {
  if (!s || s.trim() === "") return 0;
  const cleaned = s.replace(/[$,()]/g, "").trim();
  const neg = /^\-|\(.*\)$/.test(s.trim());
  const n = parseFloat(cleaned);
  const val = Number.isFinite(n) ? n : 0;
  return neg ? -val : val;
}

function inferYear(text: string): number {
  const m = text.match(/\b(20\d{2})\b/);
  if (m) return Number.parseInt(m[1], 10);
  return new Date().getFullYear();
}

function normalizeDate(month: string, day: string, year: string | undefined, yearFallback: number): string {
  let y = yearFallback;
  if (year) {
    if (year.length === 2) y = Number.parseInt(year, 10) >= 50 ? 1900 + Number.parseInt(year, 10) : 2000 + Number.parseInt(year, 10);
    else y = Number.parseInt(year, 10);
  }
  return `${y}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * Wells Fargo payee extraction: who the payment is for.
 */
function wellsFargoPayee(raw: string): string {
  const s = raw.trim();
  if (!s) return "—";

  if (/\bZelle From\s+(.+?)\s+on\s+\d/i.test(s)) return (s.match(/\bZelle From\s+(.+?)\s+on\s+\d/)!)[1].trim();
  if (/Venmo\s*\*\s*([A-Za-z][A-Za-z\s]+?)(?:\s+[A-Z]{2}\s|$)/i.test(s)) return `Venmo: ${(s.match(/Venmo\s*\*\s*([A-Za-z][A-Za-z\s]+?)(?:\s+[A-Z]{2}\s|$)/i)!)[1].trim()}`;
  if (/Venmo From\s+(\S+(?:\s+\S+)?)/i.test(s)) return `Venmo: ${(s.match(/Venmo From\s+(\S+(?:\s+\S+)?)/i)!)[1].trim()}`;

  if (/\bOnline Transfer From\s+Neu C/i.test(s)) {
    const m = s.match(/\b(?:Everyday Checking|Way2Save Savings)\s+([^R]+?)(?:\s+Ref|$)/i) || s.match(/\bRef\s+#\S+\s+Way2Save Savings\s+([^0-9]+?)(?:\s+\d|$)/i);
    if (m) return `From Neu C: ${m[1].trim()}`;
    return "From Neu C";
  }
  if (/\bRecurring Transfer From\s+Neu C/i.test(s)) {
    const m = s.match(/Everyday Checking\s+(.+?)(?:\s+\d|$)/i);
    if (m) return m[1].trim();
    return "From Neu C";
  }
  if (/\bOnline Transfer to\s+Neu C/i.test(s)) {
    const m = s.match(/Way2Save Savings\s+([^R0-9]+?)(?:\s+Ref|\s+Venmo|\s+\d|$)/i) || s.match(/Ref\s+#\S+\s+Way2Save Savings\s+([^0-9]+?)(?:\s+\d|$)/i);
    if (m) return `To Neu C: ${m[1].trim()}`;
    return "To Neu C";
  }
  if (/\bRecurring Transfer to\s+Neu C/i.test(s)) {
    const m = s.match(/Way2Save Savings\s+(.+?)(?:\s+\d|$)/i);
    if (m) return m[1].trim();
    return "To Neu C";
  }

  if (/\bOnline Transfer Ref\s+#\S+\s+to\s+(?:Wells Fargo|Platinum Card)\s+(.+?)(?:\s+\d|$)/i.test(s)) {
    const m = s.match(/to\s+(?:Wells Fargo[^C]*|Platinum Card)\s+([^0-9]+?)(?:\s+Xxxxx|\s+on\s+\d|\s+\d)/i);
    if (m) return m[1].trim();
  }
  if (/\bOnline Transfer Ref\s+#\S+\s+to\s+Platinum Card\s+(.+?)(?:\s+\d|$)/i.test(s)) {
    const m = s.match(/to Platinum Card\s+([^0-9]+?)(?:\s+\d|$)/i);
    if (m) return m[1].trim();
  }

  if (/\bQuest\s+Diagnostic/i.test(s)) return "Quest Diagnostic";
  if (/\bGusto Payroll/i.test(s)) return "Gusto Payroll";
  if (/\bFreedom Mtg/i.test(s)) return "Freedom Mortgage";
  if (/\bDominion Energy/i.test(s)) return "Dominion Energy";
  if (/\bPershing Brokerage/i.test(s)) return "Pershing Brokerage";
  if (/\bProg Preferred Ins/i.test(s)) return "Progressive Insurance";
  if (/\bState Farm/i.test(s)) return "State Farm";
  if (/\bThe Ridge at Spa/i.test(s)) return "The Ridge at Spa";
  if (/\bCh Jesuschrist Donation/i.test(s)) return "Jesus Christ Donation";
  if (/\bPaypal Inst Xfer/i.test(s)) {
    const m = s.match(/Spotify\*?/i);
    if (m) return "Spotify";
    return "PayPal";
  }
  if (/\bInterest\b/i.test(s)) return "Interest";
  if (/\bMonthly Service Fee\b/i.test(s)) return "Monthly Service Fee";
  if (/\bRecurring Payment/i.test(s) && /Hbomax|Hbo/i.test(s)) return "HBO Max";

  if (/\bPurchase authorized on\s+\d{1,2}\/\d{1,2}\s+([A-Za-z0-9][^*\n]+?)(?:\s+\*|\s+Card\s|$)/i.test(s)) {
    const m = s.match(/\bPurchase authorized on\s+\d{1,2}\/\d{1,2}\s+([A-Za-z0-9][^*\n]+?)(?:\s+\*|\s+Card\s|$)/i)!;
    const words = m[1].trim().split(/\s+/).filter((w) => /^[A-Za-z0-9.#]+$/.test(w) && w.length > 1);
    if (words.length) return words.slice(0, 3).join(" ");
  }
  if (/\bMoney Transfer.*Venmo/i.test(s)) return "Venmo";

  const firstPhrase = s.replace(/\s+(Card\s+\d+|Ref\s+#|on\s+\d{1,2}\/).*$/i, "").trim();
  const tokens = firstPhrase.split(/\s+/).filter((t) => t.length > 1 && !/^\d+$/.test(t));
  if (tokens.length) return tokens.slice(0, 3).join(" ");
  return raw.slice(0, 80).trim() || "—";
}

/** Wells Fargo: deposit (positive) vs withdrawal (negative). */
function wellsFargoIsDeposit(description: string): boolean {
  return (
    /\b(transfer from|zelle from|from\s+neu\s+c|dir dep|payroll|gusto|pershing|paypal|venmo from|interest|recurring transfer from)\b/i.test(
      description
    ) || /\b(neu c|everyday checking|way2save)\s+.*\s+from\b/i.test(description)
  );
}

/**
 * Parse Wells Fargo statement PDF text.
 * Only considers the "Transaction history" section; segments by M/D dates after an amount or after "balance ".
 */
export function parseStatementPdfText(
  text: string,
  options?: { account?: string; sourceFile?: string }
): StatementRow[] {
  const rows: StatementRow[] = [];
  const yearFallback = inferYear(text);

  // Wells Fargo: only parse after "Transaction history" to skip header/summary
  const txHistoryIdx = text.search(/Transaction\s+history/i);
  const work = txHistoryIdx >= 0 ? text.slice(txHistoryIdx) : text;

  // Segment starts: M/D at start of section, or M/D right after "XX.XX " (amount) or "balance "
  const segmentStarts: Array<{ index: number; month: string; day: string; year?: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = WF_DATE_GLOBAL.exec(work)) !== null) {
    const month = match[1];
    const day = match[2];
    const year = match[3];
    const idx = match.index;
    const before = work.slice(Math.max(0, idx - 30), idx);
    const atStart = idx === 0;
    const afterAmount = /[\d,]+\.\d{2}\s+$/.test(before);
    const afterBalance = /\bbalance\s+$/.test(before);
    if (atStart || afterAmount || afterBalance) {
      segmentStarts.push({ index: idx, month, day, year });
    }
  }

  for (let i = 0; i < segmentStarts.length; i++) {
    const { index, month, day, year } = segmentStarts[i];
    const nextIndex = i + 1 < segmentStarts.length ? segmentStarts[i + 1].index : work.length;
    const segment = work.slice(index, nextIndex).trim();
    const datePrefix = segment.match(/^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s+/);
    if (!datePrefix) continue;

    const rest = segment.slice(datePrefix[0].length).trim();
    const amountMatch = rest.match(AMOUNT_CENTS);
    if (!amountMatch || amountMatch.index === undefined) continue;

    const rawAmount = parseNum(amountMatch[0]);
    const rawDescription = rest.slice(0, amountMatch.index).trim();
    const description = wellsFargoPayee(rawDescription);
    const signedAmount = wellsFargoIsDeposit(rawDescription) ? Math.abs(rawAmount) : -Math.abs(rawAmount);

    rows.push({
      date: normalizeDate(month, day, year, yearFallback),
      description,
      amount: signedAmount,
      account: options?.account,
      sourceFile: options?.sourceFile,
    });
  }

  return rows;
}
