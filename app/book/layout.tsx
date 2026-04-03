import BookingHeader from "@/components/BookingHeader";

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8f5f2] flex flex-col">
      <BookingHeader />
      <main className="flex-1">{children}</main>
      <footer className="py-6 text-center text-xs text-[#b0a499] font-light">
        © {new Date().getFullYear()} Cocoon Skin & Beauty · Pimpama, QLD
      </footer>
    </div>
  );
}
