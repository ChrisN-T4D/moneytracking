import { NextResponse } from "next/server";
import {
  getTokenFromCookie,
  getPbBase,
  hasPbAuth,
  pbAuthFetch,
} from "@/lib/pocketbase-auth";

export const dynamic = "force-dynamic";

interface PbUser {
  id: string;
  email?: string;
  name?: string;
  username?: string;
}

interface PbListResponse<T> {
  items: T[];
  totalItems: number;
}

interface UserPreferenceRecord {
  id: string;
  user: string;
  theme?: Record<string, string> | null;
}

/** GET /api/auth/me — returns current user and theme from profile (cookie auth). */
export async function GET() {
  if (!hasPbAuth()) {
    return NextResponse.json(
      { ok: false, user: null, theme: null, message: "PocketBase not configured." },
      { status: 200 }
    );
  }

  const token = await getTokenFromCookie();
  if (!token) {
    return NextResponse.json(
      { ok: true, user: null, theme: null },
      { status: 200 }
    );
  }

  try {
    const refreshed = await pbAuthFetch<{ token?: string; record?: PbUser }>(
      "/api/users/refresh",
      { method: "POST" },
      token
    );

    const userRecord = refreshed.record;
    if (!userRecord) {
      return NextResponse.json(
        { ok: true, user: null, theme: null },
        { status: 200 }
      );
    }

    const user = {
      id: userRecord.id,
      email: userRecord.email ?? "",
      name: userRecord.name ?? "",
      username: userRecord.username ?? "",
    };

    // Load user_preferences (theme) for this user
    const base = getPbBase();
    const filter = encodeURIComponent(`user="${userRecord.id}"`);
    const prefsRes = await fetch(
      `${base}/api/collections/user_preferences/records?filter=${filter}&perPage=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );

    let theme: Record<string, string> | null = null;
    if (prefsRes.ok) {
      const prefsData = (await prefsRes.json()) as PbListResponse<UserPreferenceRecord>;
      const prefs = prefsData.items?.[0];
      if (prefs?.theme && typeof prefs.theme === "object") {
        theme = prefs.theme as Record<string, string>;
      }
    }

    return NextResponse.json({
      ok: true,
      user,
      theme,
    });
  } catch {
    return NextResponse.json(
      { ok: true, user: null, theme: null },
      { status: 200 }
    );
  }
}
