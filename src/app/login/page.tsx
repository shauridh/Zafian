"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

type Mode = "pin" | "email";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("pin");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const pressKey = (k: string) => {
    setError("");
    if (k === "back") setPin((p) => p.slice(0, -1));
    else if (k === "clear") setPin("");
    else if (pin.length < 8) setPin((p) => p + k);
  };

  const submitPin = async (p: string) => {
    if (p.length < 4) return;
    setLoading(true);
    setError("");
    const res = await signIn("pin", { pin: p, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("PIN salah");
      setPin("");
    } else {
      router.push("/pos");
      router.refresh();
    }
  };

  const handleKey = (k: string) => {
    pressKey(k);
    // auto-submit saat mencapai panjang umum
    const next = k === "back" ? pin.slice(0, -1) : k === "clear" ? "" : pin + k;
    if (k !== "back" && k !== "clear" && (next.length === 6)) {
      setTimeout(() => submitPin(next), 120);
    }
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Email atau password salah");
    } else {
      router.push("/pos");
      router.refresh();
    }
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-2xl border-[3px] border-ink bg-sun text-4xl shadow-neo">
            ☕
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Zafian<span className="bg-candy px-1 text-white">POS</span>
          </h1>
          <p className="mt-1 text-sm font-semibold text-ink/50">Masuk untuk mulai berjualan</p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border-[2.5px] border-ink bg-white p-1.5 shadow-neo">
          <button
            onClick={() => { setMode("pin"); setError(""); }}
            className={cn(
              "rounded-lg border-2 py-2 text-sm font-bold uppercase transition-all",
              mode === "pin" ? "border-ink bg-sun shadow-neo-sm" : "border-transparent text-ink/50"
            )}
          >
            PIN Kasir
          </button>
          <button
            onClick={() => { setMode("email"); setError(""); }}
            className={cn(
              "rounded-lg border-2 py-2 text-sm font-bold uppercase transition-all",
              mode === "email" ? "border-ink bg-sun shadow-neo-sm" : "border-transparent text-ink/50"
            )}
          >
            Email
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-xl border-[2.5px] border-ink bg-danger px-4 py-2.5 text-center text-sm font-bold text-white shadow-neo-sm">
            {error}
          </div>
        )}

        {mode === "pin" ? (
          <div className="rounded-2xl border-[2.5px] border-ink bg-white p-4 shadow-neo">
            <div className="mb-4 flex justify-center gap-3">
              {Array.from({ length: Math.max(6, pin.length) }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-4 w-4 rounded-full border-2 border-ink",
                    i < pin.length ? "bg-ink" : "bg-transparent"
                  )}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {keys.map((k) => (
                <button
                  key={k}
                  disabled={loading}
                  onClick={() => handleKey(k)}
                  className={cn(
                    "flex h-16 items-center justify-center rounded-xl border-[2.5px] border-ink font-display text-2xl font-bold shadow-neo-sm transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50",
                    k === "clear" && "bg-candy text-white text-lg",
                    k === "back" && "bg-white text-xl"
                  )}
                >
                  {k === "back" ? "⌫" : k === "clear" ? "C" : k}
                </button>
              ))}
            </div>
            <Button
              variant="dark"
              className="mt-3 w-full"
              disabled={loading || pin.length < 4}
              onClick={() => submitPin(pin)}
            >
              {loading ? "Memeriksa..." : "Masuk"}
            </Button>
          </div>
        ) : (
          <form
            onSubmit={submitEmail}
            className="space-y-3 rounded-2xl border-[2.5px] border-ink bg-white p-4 shadow-neo"
          >
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@kasir.id"
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            <Button type="submit" variant="dark" className="w-full" disabled={loading}>
              {loading ? "Memeriksa..." : "Masuk"}
            </Button>
          </form>
        )}

        <p className="mt-4 text-center text-[11px] font-semibold text-ink/40">
          Demo: owner@kasir.id / admin123 · PIN 1234
        </p>
      </div>
    </div>
  );
}
