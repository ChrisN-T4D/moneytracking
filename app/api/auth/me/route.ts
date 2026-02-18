import { NextResponse } from "next/server";
import {
  getTokenFromCookie,
  getPbBase,
  getUserIdFromToken,
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

  const base = getPbBase();

  let userRecord: PbUser | null = null;

  try {
    const refreshed = await pbAuthFetch<{ token?: string; record?: PbUser }>(
      "/api/users/refresh",
      { method: "POST" },
      token
    );
    userRecord = refreshed.record ?? null;
  } catch {
    // Refresh can 404 or fail in some setups; fall back to loading user by id from JWT
    const userId = getUserIdFromToken(token);
    if (userId) {
      try {
        const res = await fetch(`${base}/api/collections/users/records/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (res.ok) {
          userRecord = (await res.json()) as PbUser;
        }
      } catch {
        // Ignore
      }
    }
  }

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
  const filter = encodeURIComponent(`user="${userRecord.id}"`);
  let theme: Record<string, string> | null = null;
  try {
    const prefsRes = await fetch(
      `${base}/api/collections/user_preferences/records?filter=${filter}&perPage=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );
    if (prefsRes.ok) {
      const prefsData = (await prefsRes.json()) as PbListResponse<UserPreferenceRecord>;
      const prefs = prefsData.items?.[0];
      if (prefs?.theme && typeof prefs.theme === "object") {
        theme = prefs.theme as Record<string, string>;
      }
    }
  } catch {
    // Ignore theme load errors
  }

  return NextResponse.json({
    ok: true,
    user,
    theme,
  });
}
