import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Diagnostik deploy (aman: tidak mengembalikan kredensial).
 * GET /api/health → status DB + konfigurasi env yang relevan untuk login.
 */
export async function GET() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  let dbHost: string | null = null;
  try {
    dbHost = new URL(dbUrl).host;
  } catch {
    dbHost = null;
  }

  const checks: Record<string, unknown> = {
    ok: true,
    node: process.version,
    env: {
      hasSecret: !!process.env.NEXTAUTH_SECRET,
      hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
      hasDatabaseUrl: !!dbUrl,
      dbHost,
      usesPooler: dbUrl.includes("pooler.supabase.com"),
    },
  };

  try {
    const [users, settings] = await Promise.all([prisma.user.count(), prisma.settings.findFirst()]);
    checks.db = { connected: true, users, hasSettings: !!settings };
  } catch (e) {
    checks.ok = false;
    checks.db = {
      connected: false,
      error: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
    };
  }

  return NextResponse.json(checks, { status: checks.ok ? 200 : 503 });
}
