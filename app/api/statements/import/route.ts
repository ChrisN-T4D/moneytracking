import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { parseStatementCsv } from "@/lib/csv-statements";
import { parseStatementPdfText } from "@/lib/pdf-statements";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getBaseUrl(): string {
  const url = (process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "").replace(/\/$/, "");
  if (url.endsWith("/_")) return url.replace(/\/_\/?$/, "") || url;
  return url;
}

function isPdf(file: File): boolean {
  const t = (file.type ?? "").toLowerCase();
  const n = (file.name ?? "").toLowerCase();
  return t === "application/pdf" || n.endsWith(".pdf");
}

export async function POST(request: Request) {
  const base = getBaseUrl();
  if (!base) {
    return NextResponse.json(
      { ok: false, message: "NEXT_PUBLIC_POCKETBASE_URL is not set." },
      { status: 400 }
    );
  }

  let rows: Array<{ date: string; description: string; amount: number; balance?: number; category?: string; account?: string; sourceFile?: string }>;
  let account: string | undefined;
  let sourceFile: string | undefined;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { ok: false, message: "Missing file. Use form field 'file' with a CSV or PDF file." },
        { status: 400 }
      );
    }
    sourceFile = (formData.get("sourceFile") as string | undefined) ?? file.name;
    account = formData.get("account") as string | undefined;

    if (isPdf(file)) {
      try {
        const buffer = new Uint8Array(await file.arrayBuffer());
        const pdf = await getDocumentProxy(buffer);
        const { text } = await extractText(pdf, { mergePages: true });
        const pdfText = text ?? "";
        rows = parseStatementPdfText(pdfText, { account, sourceFile });
        if (rows.length === 0) {
          return NextResponse.json(
            {
              ok: false,
              message:
                "No rows parsed from PDF. Extracted text may use a different date/amount format. See pdfExcerpt below.",
              pdfExcerpt: pdfText.slice(0, 2000),
            },
            { status: 400 }
          );
        }
      } catch (e) {
        return NextResponse.json(
          { ok: false, message: `PDF extraction failed: ${e instanceof Error ? e.message : String(e)}` },
          { status: 400 }
        );
      }
    } else {
      const csvText = await file.text();
      rows = parseStatementCsv(csvText, { account, sourceFile });
    }
  } else {
    const body = (await request.json()) as { csv?: string; account?: string; sourceFile?: string };
    const csvText = body.csv ?? "";
    account = body.account;
    sourceFile = body.sourceFile;
    if (!csvText) {
      return NextResponse.json(
        { ok: false, message: "Missing 'csv' in request body." },
        { status: 400 }
      );
    }
    rows = parseStatementCsv(csvText, { account, sourceFile });
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, message: "No rows parsed. For CSV: ensure a header row and columns (date, description, amount). For PDF: ensure lines start with a date (e.g. MM/DD/YYYY) and include an amount." },
      { status: 400 }
    );
  }

  let imported = 0;
  const errors: string[] = [];
  let firstPocketBaseError: string | null = null;
  for (const row of rows) {
    try {
      const res = await fetch(`${base}/api/collections/statements/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: row.date,
          description: row.description,
          amount: row.amount,
          balance: row.balance ?? null,
          category: row.category ?? null,
          account: row.account ?? null,
          sourceFile: row.sourceFile ?? null,
        }),
      });
      if (res.ok) {
        imported++;
      } else {
        const errBody = await res.text();
        const errMsg = (() => {
          try {
            const j = JSON.parse(errBody) as { message?: string; data?: Record<string, { message?: string }> };
            if (j.message) return j.message;
            const firstField = j.data && Object.values(j.data)[0];
            if (firstField?.message) return firstField.message;
          } catch {
            // ignore
          }
          return errBody.slice(0, 200) || `${res.status}`;
        })();
        if (!firstPocketBaseError) firstPocketBaseError = errMsg;
        errors.push(`Row ${row.date} ${row.description}: ${res.status} ${errMsg}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!firstPocketBaseError) firstPocketBaseError = msg;
      errors.push(`Row ${row.date}: ${msg}`);
    }
  }

  const message =
    imported === rows.length
      ? `Imported ${imported} of ${rows.length} rows.`
      : firstPocketBaseError
        ? `Imported ${imported} of ${rows.length} rows. PocketBase rejected the rest. First error: ${firstPocketBaseError}`
        : `Imported ${imported} of ${rows.length} rows.`;

  return NextResponse.json({
    ok: true,
    message,
    imported,
    total: rows.length,
    errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
  });
}
