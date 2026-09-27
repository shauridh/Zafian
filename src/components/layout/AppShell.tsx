"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/lib/types";
import { Sheet } from "@/components/ui/Sheet";
import { BtIndicator } from "@/components/pos/BtIndicator";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  ownerOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/pos", label: "Kasir", icon: "🛒" },
  { href: "/orders", label: "Riwayat", icon: "🧾" },
  { href: "/shift", label: "Shift", icon: "⏱️" },
  { href: "/live", label: "Live", icon: "🔴", ownerOnly: true },
  { href: "/products", label: "Menu", icon: "🍽️", ownerOnly: true },
  { href: "/ingredients", label: "Bahan", icon: "📦", ownerOnly: true },
  { href: "/reports", label: "Laporan", icon: "📊", ownerOnly: true },
  { href: "/settings", label: "Atur", icon: "⚙️", ownerOnly: true },
];

export function AppShell({
  session,
  children,
  logoUrl,
  storeName,
}: {
  session: Session;
  children: React.ReactNode;
  logoUrl?: string;
  storeName?: string;
}) {
  const pathname = usePathname();
  const user = session.user as unknown as SessionUser;
  const isOwner = user.role === "OWNER" || user.role === "ADMIN";
  const [moreOpen, setMoreOpen] = useState(false);

  const items = NAV.filter((n) => !n.ownerOnly || isOwner);
  const primaryItems = items.slice(0, 4);
  const moreItems = items.slice(4);

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar — tablet/desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r-[2.5px] border-ink bg-white lg:flex">
        <div className="flex items-center gap-2 border-b-[2.5px] border-ink px-4 py-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded-lg border-2 border-ink object-contain" />
          ) : (
            <span className="text-xl">☕</span>
          )}
          <span className="font-display text-xl font-bold tracking-tight">
            {(storeName ?? "Zafian POS").split(" ")[0]}
            <span className="bg-accent px-1">POS</span>
          </span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl border-[2.5px] px-3 py-2.5 text-sm font-bold uppercase tracking-wide transition-all",
                pathname.startsWith(item.href)
                  ? "border-ink bg-accent shadow-neo-sm"
                  : "border-transparent hover:bg-ink/5"
              )}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t-[2.5px] border-ink p-3">
          <div className="mb-2 rounded-xl border-2 border-ink bg-cream px-3 py-2">
            <p className="truncate text-sm font-bold">{user.name}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink/50">{user.role}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex-1 rounded-xl border-[2.5px] border-ink bg-white px-3 py-2 text-sm font-bold uppercase shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Keluar
            </button>
            <BtIndicator />
          </div>
        </div>
      </aside>

      {/* Konten */}
      <main className="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-56">
        {children}
      </main>

      {/* Bottom nav — ponsel */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t-[2.5px] border-ink bg-white pb-safe lg:hidden">
        {primaryItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-bold uppercase tracking-wide",
              pathname.startsWith(item.href) ? "text-ink" : "text-ink/40"
            )}
          >
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg border-2 border-ink text-base",
                pathname.startsWith(item.href) ? "bg-accent shadow-neo-sm" : "border-transparent bg-transparent"
              )}
            >
              {item.icon}
            </span>
            {item.label}
          </Link>
        ))}
        {moreItems.length > 0 && (
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-bold uppercase tracking-wide",
              moreItems.some((i) => pathname.startsWith(i.href)) ? "text-ink" : "text-ink/40"
            )}
          >
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg border-2 border-ink text-base",
                moreItems.some((i) => pathname.startsWith(i.href)) ? "bg-sun shadow-neo-sm" : "border-transparent bg-transparent"
              )}
            >
              ⋯
            </span>
            Lainnya
          </button>
        )}
      </nav>

      {/* Sheet Lainnya — halaman yang tidak muat di bottom nav */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Menu Lainnya" maxWidth="max-w-sm">
        <div className="grid grid-cols-3 gap-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMoreOpen(false)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border-[2.5px] px-2 py-3 text-center text-[11px] font-bold uppercase shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
                pathname.startsWith(item.href) ? "border-ink bg-sun" : "border-ink bg-white text-ink/70"
              )}
            >
              <span className="text-xl">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
