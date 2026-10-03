"use client";

export function LogoutButton() {
  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    // Full navigation (not router.push) so the admin layout remounts cleanly
    // and no cached signed-in client state survives.
    window.location.href = "/admin/login";
  }

  return (
    <button
      onClick={handleLogout}
      className="text-white/70 hover:text-white text-sm transition-colors"
    >
      Sign out
    </button>
  );
}
