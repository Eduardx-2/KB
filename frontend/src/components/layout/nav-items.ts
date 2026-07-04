import { LayoutDashboard, Mic, Users, Activity } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "Panel", icon: LayoutDashboard, exact: true },
  { href: "/reuniones/nueva", label: "Nueva reunión", icon: Mic, exact: false },
  { href: "/equipo", label: "Equipo", icon: Users, exact: false },
  { href: "/sistema", label: "Sistema", icon: Activity, exact: false },
] as const;
