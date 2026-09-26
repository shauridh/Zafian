import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LiveClient } from "./LiveClient";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role ?? "CASHIER";
  if (!["OWNER", "ADMIN"].includes(role)) redirect("/pos");

  return <LiveClient />;
}
