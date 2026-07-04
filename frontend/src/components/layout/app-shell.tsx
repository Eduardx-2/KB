"use client";

import { useState } from "react";
import { Menu, Sparkles } from "lucide-react";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden md:block md:shrink-0">
        <div className="sticky top-0 h-dvh">
          <Sidebar />
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-neutral-900/50" onClick={() => setMobileOpen(false)} />
          <div className="relative animate-fade-in">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-neutral-200 bg-white/80 px-4 py-3 backdrop-blur md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100"
            aria-label="Abrir menú"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-neutral-900 text-white">
              <Sparkles className="size-3.5" />
            </div>
            <span className="text-sm font-semibold text-neutral-900">Meeting → Tickets</span>
          </div>
        </header>

        <main className="flex-1 bg-[var(--background)]">{children}</main>
      </div>
    </div>
  );
}
