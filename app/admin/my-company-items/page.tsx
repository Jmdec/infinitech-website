// File: app/admin/my-company-items/page.tsx
import MyRequestsPanel from "./my-requests-panel";

export const metadata = { title: "My Company Items" };

export default function MyCompanyItemsPage() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          My company items
        </h1>
        <p className="text-sm text-slate-500">
          Request a replacement for your company ID or polo shirt and track its
          status.
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white">
        <MyRequestsPanel />
      </div>
    </div>
  );
}
