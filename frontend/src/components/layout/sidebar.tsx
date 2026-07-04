"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, Plus } from "lucide-react";
import { NAV_ITEMS } from "./nav-items";
import { ConnectionBadge } from "./connection-badge";
import { cn } from "@/lib/utils";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col bg-neutral-950 text-neutral-100">
      <div className="flex items-center gap-2.5 px-5 pb-2 pt-6">
        <div className="flex size-8 items-center justify-center rounded-lg bg-white text-neutral-900">
          <Sparkles className="size-4" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Meeting → Tickets</p>
          <p className="text-[11px] text-neutral-500">AI PM Copilot</p>
        </div>
      </div>

      <div className="px-3 pt-5">
        <Link
          href="/reuniones/nueva"
          onClick={onNavigate}
          className="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-200"
        >
          <Plus className="size-4" />
          Nueva reunión
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3 pt-6">
        <p className="px-2.5 pb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-600">
          Navegación
        </p>
        {NAV_ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-white/10 text-white"
                  : "text-neutral-400 hover:bg-white/5 hover:text-neutral-100"
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-white/10 p-4">
        <ConnectionBadge />
        <p className="px-1 text-[11px] leading-relaxed text-neutral-600">
          Cursor Buildathon El Salvador · Jul 2026
        </p>
      </div>
    </div>
  );
}
