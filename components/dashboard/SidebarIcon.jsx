import {
  Award, BookOpen, CalendarCheck, CalendarDays, ClipboardList, Contact, DoorOpen, Files, GraduationCap,
  LayoutDashboard, Mail, Megaphone, MessageCircle, Presentation, QrCode, ScanQrCode,
  Settings, ShoppingBag, Sparkles, Ticket, Trophy, UserRound, UsersRound, WalletCards,
} from "lucide-react";

const icons = {
  Dashboard: LayoutDashboard, Students: UsersRound, Teacher: Presentation,
  Teachers: Presentation, Training: BookOpen, "My Training": BookOpen,
  Event: CalendarDays, Events: CalendarDays, "Room Booking": DoorOpen, Finance: WalletCards,
  Documents: Files, "My Shop": ShoppingBag, User: UserRound, Users: UserRound,
  Chat: MessageCircle, Achievement: Trophy, Achievements: Trophy,
  "ID Card": Contact, "ID Cards": Contact, "Scan QR Code": ScanQrCode,
  "QR Scanner": QrCode, Attendance: Award, Certificates: Award,
  Settings, Activities: Award, Promote: Megaphone, "AI Assistant": Sparkles,
  "Contact Inquiries": Mail, "Model Test": ClipboardList, "Promo Codes": Ticket,
  Appointments: CalendarCheck,
};

export default function SidebarIcon({ name, className = "h-5 w-5" }) {
  const Icon = icons[name] || GraduationCap;
  return <Icon className={className} strokeWidth={1.9} aria-hidden="true" />;
}

// Sidebar display overrides — the module key stays the same everywhere
// (routing, icons, badges); only the label shown in the nav changes.
const NAV_LABELS = {
  "My Shop": "Shop",
  "Contact Inquiries": "Contact",
};

export function navLabel(name) {
  return NAV_LABELS[name] || name;
}
