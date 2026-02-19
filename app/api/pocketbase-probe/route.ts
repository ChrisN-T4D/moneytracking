import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Probe PocketBase base URLs: try GET /api/health and return which (if any) responds. */
export async function GET() {
  try {
    const baseUrl =
      (process.env.POCKETBASE_API_URL ?? "").trim() ||
      (process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "").trim();
    if (!baseUrl) {
      return NextResponse.json(
        { ok: false, message: "NEXT_PUBLIC_POCKETBASE_URL not set.", results: [] },
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Normalise: strip /_ so we probe root (the REST API), not the admin UI path
    const base = baseUrl.replace(/\/$/, "").replace(/\/_\/?$/, "");
    const candidates: string[] = [base, `${base}/_`];

    const results: Array<{ base: string; healthUrl: string; status: number | null; error?: string }> = [];
    for (const b of candidates) {
      const healthUrl = `${b}/api/health`;
      try {
        const res = await fetch(healthUrl, { method: "GET", cache: "no-store" });
        results.push({ base: b, healthUrl, status: res.status });
      } catch (e) {
        results.push({
          base: b,
          healthUrl,
          status: null,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const working = results.find((r) => r.status === 200);
    // Always probe admin auth at root (strip /_ so we don't hit admin UI path)
    const workingRoot = working ? working.base.replace(/\/_\/?$/, "") : null;
    let adminAuthStatus: number | null = null;
    let adminAuthUrl: string | null = null;
    if (workingRoot) {
      adminAuthUrl = `${workingRoot}/api/admins/auth-with-password`;
      try {
        const authRes = await fetch(adminAuthUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identity: "", password: "" }),
          cache: "no-store",
        });
        adminAuthStatus = authRes.status;
      } catch {
        adminAuthStatus = null;
      }
    }

    return NextResponse.json(
      {
        ok: !!working,
        message: working
          ? `API reachable at ${workingRoot}`
          : "No base URL returned 200 for /api/health. Your host may block /api/* or use a different path.",
        results,
        adminAuth: adminAuthUrl
          ? {
              url: adminAuthUrl,
              status: adminAuthStatus,
              hint:
                adminAuthStatus === 404
                  ? "Admin API returned 404. Check reverse proxy: /api/admins/* must be proxied to PocketBase."
                  : adminAuthStatus === 400
                    ? "Admin API exists (400 = bad request). Setup with admin credentials should work."
                    : adminAuthStatus != null
                      ? `Admin API returned ${adminAuthStatus}.`
                      : "Could not reach admin API.",
            }
          : null,
      },
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message: "Probe failed.",
        error: err instanceof Error ? err.message : String(err),
        results: [],
      },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
