import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import AdminShell from "./admin-shell";

export const metadata: Metadata = {
  title: "Infinitech Admin",
  manifest: "/admin.webmanifest",
  appleWebApp: {
    capable: true,
    title: "IA Admin",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#164e63",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
