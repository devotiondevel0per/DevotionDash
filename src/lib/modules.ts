import {
  Home,
  CheckSquare,
  FolderOpen,
  Mail,
  MessageSquare,
  Building2,
  Users,
  Clipboard,
  Layers,
  Calendar,
  Phone,
  Package,
  BookOpen,
  CreditCard,
  Search,
  Headphones,
  TicketCheck,
  Settings,
  FolderKanban,
  type LucideIcon,
} from "lucide-react";
import type { ModuleId } from "@/lib/permissions";

export interface Module {
  id: ModuleId;
  label: string;
  href: string;
  icon: LucideIcon;
  color: string;
  adminOnly?: boolean;
}

export const modules: Module[] = [
  { id: "home",         label: "Home",          href: "/home",         icon: Home,        color: "#B02B2C" },
  { id: "tasks",        label: "Tasks",          href: "/tasks",        icon: CheckSquare, color: "#C79810" },
  { id: "projects",     label: "Projects",       href: "/projects",     icon: FolderKanban,color: "#437388" },
  { id: "documents",    label: "Documents",      href: "/documents",    icon: FolderOpen,  color: "#437388" },
  { id: "email",        label: "E-Mail",         href: "/email",        icon: Mail,        color: "#5EAD63" },
  { id: "board",        label: "Board",          href: "/board",        icon: Clipboard,   color: "#C79810" },
  { id: "leads",        label: "Leads",          href: "/leads",        icon: FolderKanban,color: "#5EAD63" },
  { id: "clients",      label: "Organizations",  href: "/clients",      icon: Building2,   color: "#3B4A61" },
  { id: "contacts",     label: "Contacts",       href: "/contacts",     icon: Users,       color: "#818b4b" },
  { id: "team",         label: "Team",           href: "/team",         icon: Layers,      color: "#525739" },
  { id: "calendar",     label: "Calendar",       href: "/calendar",     icon: Calendar,    color: "#437388" },
  { id: "chat",         label: "Chat",           href: "/chat",         icon: MessageSquare,color: "#5EAD63" },
  { id: "livechat",     label: "Live Chat",      href: "/livechat",     icon: Headphones,  color: "#5EAD63" },
  { id: "servicedesk",  label: "Ticket Desk",    href: "/servicedesk",  icon: TicketCheck, color: "#5EAD63" },
  { id: "products",     label: "Products",       href: "/products",     icon: Package,     color: "#818b4b" },
  { id: "accounting",   label: "Accounting",     href: "/accounting",   icon: BookOpen,    color: "#818b4b" },
  { id: "ebank",        label: "e-Bank",         href: "/ebank",        icon: CreditCard,  color: "#818b4b" },
  { id: "telephony",    label: "Telephony",      href: "/telephony",    icon: Phone,       color: "#818b4b" },
  { id: "search",       label: "Search",         href: "/search",       icon: Search,      color: "#000000" },
  { id: "administration", label: "Administration", href: "/administration", icon: Settings, color: "#D15600", adminOnly: true },
];
