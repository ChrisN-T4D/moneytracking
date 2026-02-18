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

  let body: { theme?: Record<string, string>; name?: string };
  try {
    body = (await request.json()) as { theme?: Record<string, string>; name?: string };
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const theme = body.theme;
  const name = typeof body.name === "string" ? body.name.trim() : undefined;

  // Require at least one field to update
  if (!theme && name === undefined) {
    return NextResponse.json(
      { ok: false, message: "theme or name is required." },
      { status: 400 }
    );
  }

  // Validate theme if provided
  if (theme && typeof theme !== "object") {
    return NextResponse.json(
      { ok: false, message: "theme must be an object." },
      { status: 400 }
    );
  }

  const base = getPbBase();
  if (!base || base.startsWith("http://localhost:3001") || base.startsWith("http://127.0.0.1:3001")) {
    return NextResponse.json(
      { ok: false, message: "PocketBase URL is not configured. Set NEXT_PUBLIC_POCKETBASE_URL to your PocketBase server (e.g. http://127.0.0.1:8090)." },
      { status: 500 }
    );
  }

  // Prefer user id from JWT so we don't depend on /api/users/refresh (which can 404 in some setups)
  let userId: string | null = getUserIdFromToken(token);
  if (!userId) {
    try {
      const refreshed = await pbAuthFetch<{ record?: PbUser }>(
        "/api/users/refresh",
        { method: "POST" },
        token
      );
      userId = refreshed.record?.id ?? null;
    } catch (refreshErr) {
      const msg = refreshErr instanceof Error ? refreshErr.message : "Session refresh failed.";
      return NextResponse.json(
        { ok: false, message: msg },
        { status: 502 }
      );
    }
  }
  if (!userId) {
    return NextResponse.json(
      { ok: false, message: "Invalid session." },
      { status: 401 }
    );
  }

  try {
    const filter = encodeURIComponent(`user="${userId}"`);
    const listRes = await fetch(
      `${base}/api/collections/user_preferences/records?filter=${filter}&perPage=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );

    if (!listRes.ok) {
      const errorText = await listRes.text();
      throw new Error(`Failed to list user_preferences: ${listRes.status} ${errorText}`);
    }

    const listData = (await listRes.json()) as PbListResponse<UserPreferenceRecord>;
    const existing = listData.items?.[0];

    // Update user name if provided
    if (name !== undefined) {
      const updateUserRes = await fetch(`${base}/api/collections/users/records/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
        cache: "no-store",
      });

      if (!updateUserRes.ok) {
        const errorText = await updateUserRes.text();
        let errorMsg = `Failed to update user name: ${updateUserRes.status} ${errorText}`;
        if (updateUserRes.status === 404) {
          errorMsg += " Ensure the users collection Update API rule is set to: id = @request.auth.id";
        }
        console.error(errorMsg);
        // If only updating name, return error immediately
        if (!theme) {
          return NextResponse.json(
            { ok: false, message: errorMsg },
            { status: [400, 401, 403, 404].includes(updateUserRes.status) ? updateUserRes.status : 502 }
          );
        }
        // If also updating theme, continue but log the error
      }
    }

    // Update/create user_preferences if theme is provided
    if (theme) {
      if (existing) {
        const updateRes = await pbAuthFetch<{ theme?: Record<string, string> }>(
          `/api/collections/user_preferences/records/${existing.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ theme }),
          },
          token
        );
        // Verify update succeeded
        if (!updateRes) {
          throw new Error("Failed to update user_preferences");
        }
      } else {
        // Create new user_preferences record
        // The API rule requires user = @request.auth.id, so we set user to the authenticated user's ID
        // Note: userId comes from /api/users/refresh which returns the same user as @request.auth.id
        const createRes = await fetch(`${base}/api/collections/user_preferences/records`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ 
            user: userId, // This must match @request.auth.id for the API rule to pass
            theme 
          }),
          cache: "no-store",
        });

        if (!createRes.ok) {
          const errorText = await createRes.text();
          console.error(`Failed to create user_preferences: ${createRes.status}`, errorText);
          // Return more detailed error for debugging
          return NextResponse.json(
            { ok: false, message: `Failed to create user_preferences: ${createRes.status} ${errorText}` },
            { status: createRes.status === 400 ? 400 : 502 }
          );
        }
      }
    }

    return NextResponse.json({ ok: true, theme, name });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save profile.";
    return NextResponse.json(
      { ok: false, message },
      { status: 502 }
    );
  }
}
