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

/** PATCH /api/profile — body: { theme }. Updates or creates user_preferences for current user. */
export async function PATCH(request: Request) {
  if (!hasPbAuth()) {
    return NextResponse.json(
      { ok: false, message: "PocketBase not configured." },
      { status: 400 }
    );
  }

  const token = await getTokenFromCookie();
  if (!token) {
    return NextResponse.json(
      { ok: false, message: "Not authenticated." },
      { status: 401 }
    );
  }

  let body: { theme?: Record<string, string> };
  try {
    body = (await request.json()) as { theme?: Record<string, string> };
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const theme = body.theme;
  if (!theme || typeof theme !== "object") {
    return NextResponse.json(
      { ok: false, message: "theme object is required." },
      { status: 400 }
    );
  }

  try {
    const refreshed = await pbAuthFetch<{ record?: PbUser }>(
      "/api/users/refresh",
      { method: "POST" },
      token
    );

    const userId = refreshed.record?.id;
    if (!userId) {
      return NextResponse.json(
        { ok: false, message: "Invalid session." },
        { status: 401 }
      );
    }

    const base = getPbBase();
    const filter = encodeURIComponent(`user="${userId}"`);
    const listRes = await fetch(
      `${base}/api/collections/user_preferences/records?filter=${filter}&perPage=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );

    const listData = (await listRes.json()) as PbListResponse<UserPreferenceRecord>;
    const existing = listData.items?.[0];

    if (existing) {
      await pbAuthFetch(
        `/api/collections/user_preferences/records/${existing.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ theme }),
        },
        token
      );
    } else {
      await fetch(`${base}/api/collections/user_preferences/records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user: userId, theme }),
        cache: "no-store",
      });
    }

    return NextResponse.json({ ok: true, theme });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save profile.";
    return NextResponse.json(
      { ok: false, message },
      { status: 502 }
    );
  }
}
