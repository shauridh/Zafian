"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * Tombol "Pasang App" — saat diklik, Chrome Android memasang Zafian POS ke home
 * screen dan membukanya sebagai PWA standalone/fullscreen (tanpa address bar,
 * konten sampai ke belakang status bar). Dipasang sekali, buka dari ikon homescreen.
 */
export function InstallPrompt() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches) {
      setInstalled(true);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || !evt) return null;

  return (
    <Button
      className="w-full"
      onClick={async () => {
        await evt.prompt();
        const choice = await evt.userChoice;
        if (choice.outcome === "accepted") setInstalled(true);
        setEvt(null);
      }}
    >
      📲 Pasang App (full screen)
    </Button>
  );
}
