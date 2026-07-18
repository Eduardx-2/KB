import { LayoutDashboard, Mic, Users, Activity, FolderKanban, Settings, Shuffle } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "Panel", icon: LayoutDashboard, exact: true },
  { href: "/proyectos", label: "Proyectos", icon: FolderKanban, exact: false },
  { href: "/reuniones/nueva", label: "Nueva reunión", icon: Mic, exact: false },
  { href: "/equipo", label: "Equipo", icon: Users, exact: false },
  { href: "/reorg", label: "Reorg", icon: Shuffle, exact: false, managerOnly: true },
  { href: "/sistema", label: "Sistema", icon: Activity, exact: false },
  { href: "/settings", label: "Configuración", icon: Settings, exact: false },
] as const;
