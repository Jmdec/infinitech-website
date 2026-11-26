// File: app/admin/item-replacement/page.tsx
import ReplacementRequestsPanel from "./replacement-requests-panel";

export const metadata = { title: "Item Replacement Requests" };

export default function ItemReplacementPage() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Company-issued item replacement
        </h1>
        <p className="text-sm text-slate-500">
          File, endorse, approve and release replacement requests for company
          IDs and polo shirts.
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white">
        <ReplacementRequestsPanel />
      </div>
    </div>
  );
}
