import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, getPbBase, hasPbAuth } from "@/lib/pocketbase-auth";

export const dynamic = "force-dynamic";

/** POST /api/auth/signup — body: { email, password, passwordConfirm, name? }. Creates user and sets auth cookie. */
export async function POST(request: Request) {
  if (!hasPbAuth()) {
    return NextResponse.json(
      { ok: false, message: "PocketBase not configured." },
      { status: 400 }
    );
  }

  let body: { email?: string; password?: string; passwordConfirm?: string; name?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string; passwordConfirm?: string; name?: string };
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const passwordConfirm = typeof body.passwordConfirm === "string" ? body.passwordConfirm : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!email || !password || !passwordConfirm) {
    return NextResponse.json(
      { ok: false, message: "email, password, and passwordConfirm are required." },
      { status: 400 }
    );
  }

  if (password !== passwordConfirm) {
    return NextResponse.json(
      { ok: false, message: "Passwords do not match." },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { ok: false, message: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const base = getPbBase();
  
  // Step 1: Create the user
  const createUrl = `${base}/api/collections/users/records`;
  
  try {
    const createRes = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        passwordConfirm,
        name: name || undefined,
        emailVisibility: true, // Make email visible to the user
      }),
      cache: "no-store",
    });

    const createData = (await createRes.json()) as {
      id?: string;
      email?: string;
      name?: string;
      username?: string;
      token?: string;
      record?: { id: string; email?: string; name?: string; username?: string };
      message?: string;
    };

    if (!createRes.ok) {
      const message = createData.message ?? "Sign up failed.";
      return NextResponse.json(
        { ok: false, message },
        { status: createRes.status === 400 ? 400 : 500 }
      );
    }

    // Step 2: Auto-authenticate the user (PocketBase returns token on signup if email verification is disabled)
    const token = createData.token;
    const user = createData.record || createData;

    if (token && user?.id) {
      // User created and auto-authenticated — set cookie via Next.js cookies API
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
          email: user.email ?? email,
          name: user.name ?? name ?? "",
          username: user.username ?? "",
        },
      });
    }

    // If no token, try to authenticate manually
    const authUrl = `${base}/api/collections/users/auth-with-password`;
    const authRes = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: email, password }),
      cache: "no-store",
    });

    const authData = (await authRes.json()) as {
      token?: string;
      record?: { id: string; email?: string; name?: string; username?: string };
    };

    if (!authRes.ok || !authData.token || !authData.record) {
      return NextResponse.json(
        { ok: false, message: "Account created but login failed. Please try logging in manually." },
        { status: 201 }
      );
    }

    const cookieStore = await cookies();
    const maxAge = 60 * 60 * 24 * 14; // 14 days
    cookieStore.set(AUTH_COOKIE_NAME, authData.token, {
      path: "/",
      maxAge,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return NextResponse.json({
      ok: true,
      user: {
        id: authData.record.id,
        email: authData.record.email ?? email,
        name: authData.record.name ?? name ?? "",
        username: authData.record.username ?? "",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign up failed.";
    return NextResponse.json(
      { ok: false, message },
      { status: 502 }
    );
  }
}
