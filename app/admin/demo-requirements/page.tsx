import AdminDemoRequirementsPage from "@/components/admin-demo-requirements-page";

export const metadata = {
  title: "Admin - Website Demo Requirements",
  description: "Manage website demo requirements submissions",
};

export default function AdminDemoPage() {
  return (
    <>
      <div className="admin-demo-requirements-light min-h-full bg-slate-50 text-slate-900">
        <AdminDemoRequirementsPage />
      </div>
      <style>{`
        .admin-demo-requirements-light [class*="dark:bg-"] {
          background-color: #fff !important;
        }
        .admin-demo-requirements-light [class*="dark:hover:bg-"]:hover {
          background-color: #eff6ff !important;
        }
        .admin-demo-requirements-light [class*="dark:text-"] {
          color: #0f172a !important;
        }
        .admin-demo-requirements-light [class*="dark:hover:text-"]:hover {
          color: #1d4ed8 !important;
        }
        .admin-demo-requirements-light [class*="dark:border-"] {
          border-color: #e2e8f0 !important;
        }
        .admin-demo-requirements-light [class*="dark:hover:border-"]:hover {
          border-color: #bfdbfe !important;
        }
      `}</style>
    </>
  );
}
