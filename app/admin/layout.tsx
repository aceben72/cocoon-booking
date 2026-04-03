import Link from "next/link";
import { LogoutButton } from "./LogoutButton";
import AdminMobileWrapper from "./AdminMobileWrapper";

export const metadata = { title: "Admin | Cocoon Skin & Beauty" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8f5f2]">
      {/* Top nav — always visible on desktop; hidden below sm on mobile via CSS
          (the MobileCalendar provides its own full-screen UI on mobile) */}
      <header className="bg-[#044e77] text-white">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-[family-name:var(--font-cormorant)] italic text-xl">
              Cocoon Admin
            </span>
            <nav className="hidden sm:flex items-center gap-1 text-sm">
              <NavLink href="/admin/appointments">Appointments</NavLink>
              <NavLink href="/admin/classes">Classes</NavLink>
              <NavLink href="/admin/clients">Clients</NavLink>
              <NavLink href="/admin/gift-cards">Gift Cards</NavLink>
              <NavLink href="/admin/coupons">Coupons</NavLink>
            </nav>
          </div>
          <LogoutButton />
        </div>
      </header>

      {/* AdminMobileWrapper renders MobileCalendar on < 768 px screens,
          and the normal page children on ≥ 768 px screens. */}
      <AdminMobileWrapper>{children}</AdminMobileWrapper>
    </div>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors"
    >
      {children}
    </Link>
  );
}
