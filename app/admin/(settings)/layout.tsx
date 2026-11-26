// app/admin/(settings)/layout.tsx
// Route group: the folder name in parentheses does NOT appear in the URL, so
// /admin/settings, /admin/access-management and /admin/roadmap keep their
// current addresses. Every page inside this folder gets the shared tab bar.

import SettingsNav from "@/components/admin/settings-nav";

export default function SettingsAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SettingsNav />
      {children}
    </>
  );
}
