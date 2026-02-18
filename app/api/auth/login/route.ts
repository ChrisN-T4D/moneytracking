import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, getPbBase, hasPbAuth } from "@/lib/pocketbase-auth";

export const dynamic = "force-dynamic";

/** POST /api/auth/login — body: { identity, password }. Sets httpOnly cookie and returns user. */
export async function POST(request: Request) {
  if (!hasPbAuth()) {
    return NextResponse.json(
      { ok: false, message: "PocketBase not configured." },
      { status: 400 }
    );
  }

  let body: { identity?: string; password?: string };
  try {
    body = (await request.json()) as { identity?: string; password?: string };
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const identity = typeof body.identity === "string" ? body.identity.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!identity || !password) {
    return NextResponse.json(
      { ok: false, message: "identity and password are required." },
      { status: 400 }
    );
  }

  const base = getPbBase();
  const url = `${base}/api/collections/users/auth-with-password`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity, password }),
      cache: "no-store",
    });

    const data = (await res.json()) as {
      token?: string;
      record?: { id: string; email?: string; name?: string; username?: string };
    };

    if (!res.ok) {
      const message =
        (data as { message?: string }).message ?? "Login failed.";
      return NextResponse.json(
        { ok: false, message },
        { status: 401 }
      );
    }

    const token = data.token;
    const user = data.record;

    if (!token || !user) {
      return NextResponse.json(
        { ok: false, message: "Invalid auth response." },
        { status: 502 }
      );
    }

    const cookieStore = await cookies();
    const maxAge = 60 * 60 * 24 * 14; // 14 days
    cookieStore.set(AUTH_COOKIE_NAME, token, {
      path: "/",
      maxAge,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email ?? "",
        name: user.name ?? "",
        username: user.username ?? "",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed.";
    return NextResponse.json(
      { ok: false, message },
      { status: 502 }
    );
  }
}
