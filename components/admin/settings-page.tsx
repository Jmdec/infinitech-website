"use client";
// components/admin/settings-page.tsx

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader, Mail, PenLine, Plus, Settings, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ENDPOINT = "/api/admin/settings";
const SIGNATURE_ENDPOINT = "/api/admin/department-signature";
const MY_SIGNATURE_ENDPOINT = "/api/admin/my-signature";
const SIGNATURE_LOGO = "/email/email-signature-logo.png"; // file in /public
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EmailList = {
  key: string;
  type: "emails";
  label: string;
  description: string;
  emails: string[];
};

type DepartmentRow = { name: string; emails: string[] };

type DepartmentList = {
  key: string;
  type: "departments";
  label: string;
  description: string;
  departments: DepartmentRow[];
};

type SettingItem = EmailList | DepartmentList;

async function readJson(response: Response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const first = Object.values(result?.errors ?? {}).flat()[0];
    throw new Error(
      (typeof first === "string" ? first : null) ||
        result.message ||
        "The request could not be completed.",
    );
  }
  return result;
}

const parseEmails = (value: string) =>
  value
    .split(/[\s,;]+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

/* ============================================================================
 * General notification emails (To)
 * ========================================================================== */

function EmailListCard({ list }: { list: EmailList }) {
  const [emails, setEmails] = useState<string[]>(list.emails);
  const [saved, setSaved] = useState<string[]>(list.emails);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  const add = () => {
    const values = parseEmails(input);
    if (values.length === 0) return;

    const bad = values.find((v) => !EMAIL_RE.test(v));
    if (bad) return toast.error(`"${bad}" is not a valid email.`);

    setEmails((current) => Array.from(new Set([...current, ...values])));
    setInput("");
  };

  const remove = (email: string) =>
    setEmails((current) => current.filter((e) => e !== email));

  const dirty =
    JSON.stringify([...emails].sort()) !== JSON.stringify([...saved].sort());

  const save = async () => {
    if (emails.length === 0) return toast.error("Keep at least one recipient.");
    setSaving(true);
    try {
      const result = await readJson(
        await fetch(`${ENDPOINT}/${list.key}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emails }),
        }),
      );
      const next = (result.data?.emails ?? emails) as string[];
      setEmails(next);
      setSaved(next);
      toast.success(`${list.label} saved.`);
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Unable to save settings.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
          <Mail aria-hidden="true" size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">
            {list.label}
          </h2>
          <p className="text-sm text-slate-500">{list.description}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label={`Add email for ${list.label}`}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="name@company.com (paste many, separated by commas)"
          value={input}
        />
        <Button onClick={add} type="button" variant="outline">
          <Plus className="mr-1.5 h-4 w-4" />
          Add
        </Button>
      </div>

      {emails.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          No recipients yet. Add at least one.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {emails.map((email) => (
            <li
              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
              key={email}
            >
              <span className="min-w-0 truncate text-slate-800">{email}</span>
              <button
                aria-label={`Remove ${email}`}
                className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                onClick={() => remove(email)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex justify-end">
        <Button
          disabled={saving || !dirty}
          onClick={() => void save()}
          type="button"
        >
          {saving && <Loader className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </div>
    </section>
  );
}

/* ============================================================================
 * Department supervisors (CC)
 * ========================================================================== */

type DepartmentFormRow = { name: string; emails: string };

const toFormRows = (rows: DepartmentRow[]): DepartmentFormRow[] =>
  rows.map((row) => ({ name: row.name, emails: row.emails.join(", ") }));

function DepartmentCard({ list }: { list: DepartmentList }) {
  const [rows, setRows] = useState<DepartmentFormRow[]>(
    toFormRows(list.departments),
  );
  const [saved, setSaved] = useState(
    JSON.stringify(toFormRows(list.departments)),
  );
  const [saving, setSaving] = useState(false);

  const update = (index: number, patch: Partial<DepartmentFormRow>) =>
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );

  const dirty = JSON.stringify(rows) !== saved;

  const save = async () => {
    const departments: DepartmentRow[] = [];

    for (const row of rows) {
      const name = row.name.trim();
      const emails = parseEmails(row.emails);

      if (!name && emails.length === 0) continue; // blank row
      if (!name) return toast.error("Every row needs a department name.");
      if (emails.length === 0) {
        return toast.error(`Add at least one email for ${name}.`);
      }
      const bad = emails.find((v) => !EMAIL_RE.test(v));
      if (bad) return toast.error(`"${bad}" is not a valid email.`);

      departments.push({ name, emails });
    }

    setSaving(true);
    try {
      const result = await readJson(
        await fetch(`${ENDPOINT}/${list.key}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ departments }),
        }),
      );
      const next = toFormRows(
        (result.data?.departments ?? departments) as DepartmentRow[],
      );
      setRows(next);
      setSaved(JSON.stringify(next));
      toast.success("Department supervisors saved.");
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Unable to save settings.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
          <Users aria-hidden="true" size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">
            {list.label}
          </h2>
          <p className="text-sm text-slate-500">{list.description}</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {rows.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            No departments yet. Add one below.
          </p>
        )}

        {rows.map((row, index) => (
          <div className="flex flex-col gap-2 sm:flex-row" key={index}>
            <Input
              aria-label="Department name"
              className="sm:w-56"
              onChange={(event) => update(index, { name: event.target.value })}
              placeholder="Department (e.g. IT)"
              value={row.name}
            />
            <Input
              aria-label={`Supervisor emails for ${row.name || "department"}`}
              onChange={(event) =>
                update(index, { emails: event.target.value })
              }
              placeholder="supervisor@company.com (separate many with commas)"
              value={row.emails}
            />
            <button
              aria-label={`Remove ${row.name || "department"}`}
              className="shrink-0 self-center rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              onClick={() =>
                setRows((current) => current.filter((_, i) => i !== index))
              }
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <Button
          onClick={() =>
            setRows((current) => [...current, { name: "", emails: "" }])
          }
          type="button"
          variant="outline"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add department
        </Button>
        <Button
          disabled={saving || !dirty}
          onClick={() => void save()}
          type="button"
        >
          {saving && <Loader className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </div>
    </section>
  );
}

/* ============================================================================
 * Email signature (per department)
 * ========================================================================== */

type SignatureForm = {
  company_name: string;
  office_address: string;
  telephone: string;
  website: string;
};

type Sender = {
  name: string | null;
  position: string | null;
  mobile: string | null;
};

const EMPTY_SIGNATURE: SignatureForm = {
  company_name: "",
  office_address: "",
  telephone: "",
  website: "",
};

const toSignatureForm = (
  data: Partial<Record<keyof SignatureForm, string | null>>,
): SignatureForm => ({
  company_name: data?.company_name ?? "",
  office_address: data?.office_address ?? "",
  telephone: data?.telephone ?? "",
  website: data?.website ?? "",
});

function SignatureCard() {
  const [departments, setDepartments] = useState<string[] | null>(null);
  const [department, setDepartment] = useState("");
  const [form, setForm] = useState<SignatureForm>(EMPTY_SIGNATURE);
  const [saved, setSaved] = useState(JSON.stringify(EMPTY_SIGNATURE));
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sender, setSender] = useState<Sender | null>(null);

  // 1. Which departments may this user edit?
  useEffect(() => {
    (async () => {
      try {
        const result = await readJson(
          await fetch(`${SIGNATURE_ENDPOINT}/departments`, {
            cache: "no-store",
          }),
        );
        const list = (result.data ?? []) as string[];
        setDepartments(list);
        if (list.length > 0) setDepartment(list[0]);
      } catch (failure) {
        setDepartments([]);
        toast.error(
          failure instanceof Error
            ? failure.message
            : "Unable to load departments.",
        );
      }
    })();
  }, []);

  // 2. Who is signed in? Used for the preview only.
  useEffect(() => {
    (async () => {
      try {
        const result = await readJson(
          await fetch(MY_SIGNATURE_ENDPOINT, { cache: "no-store" }),
        );
        setSender({
          name: result.data?.name ?? null,
          position: result.data?.position ?? null,
          mobile: result.data?.mobile ?? null,
        });
      } catch {
        setSender(null); // preview falls back to sample text
      }
    })();
  }, []);

  // 3. Load the details of the selected department.
  useEffect(() => {
    if (!department) return;
    let cancelled = false;

    (async () => {
      setLoadingDetails(true);
      try {
        const result = await readJson(
          await fetch(
            `${SIGNATURE_ENDPOINT}?department=${encodeURIComponent(department)}`,
            { cache: "no-store" },
          ),
        );
        if (cancelled) return;
        const next = toSignatureForm(result.data ?? {});
        setForm(next);
        setSaved(JSON.stringify(next));
      } catch (failure) {
        if (cancelled) return;
        setForm(EMPTY_SIGNATURE);
        setSaved(JSON.stringify(EMPTY_SIGNATURE));
        toast.error(
          failure instanceof Error
            ? failure.message
            : "Unable to load signature details.",
        );
      } finally {
        if (!cancelled) setLoadingDetails(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [department]);

  const dirty = JSON.stringify(form) !== saved;

  const update = (patch: Partial<SignatureForm>) =>
    setForm((current) => ({ ...current, ...patch }));

  const save = async () => {
    const website = form.website.trim();
    if (website && !/^https?:\/\/\S+$/i.test(website)) {
      return toast.error("Website must start with http:// or https://");
    }

    setSaving(true);
    try {
      const result = await readJson(
        await fetch(SIGNATURE_ENDPOINT, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ department, ...form, website }),
        }),
      );
      const next = toSignatureForm(result.data ?? form);
      setForm(next);
      setSaved(JSON.stringify(next));
      toast.success(result.message || "Signature details saved.");
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Unable to save settings.",
      );
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <div className="flex items-start gap-3">
      <span className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
        <PenLine aria-hidden="true" size={20} />
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-900">
          Email signature
        </h2>
        <p className="text-sm text-slate-500">
          Company details added under every notification email. The
          sender&apos;s name, position and mobile number come from their
          employee record.
        </p>
      </div>
    </div>
  );

  if (departments === null) {
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />;
  }

  if (departments.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        {header}
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          No departments found. Add a department to an employee in the
          masterfile first.
        </p>
      </section>
    );
  }

  const hasPreview = Object.values(form).some((v) => v.trim());

  // Signed-in user's details; sample text only if the fetch failed.
  const previewName = sender ? sender.name || "Your name" : "Your name";
  const previewPosition = sender ? sender.position : "Position";
  const previewMobile = sender ? sender.mobile : "09XX XXX XXXX";
  const positionLine = [previewPosition, form.company_name]
    .filter(Boolean)
    .join(" - ");
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      {header}

      <div className="mt-4 space-y-4">
        <div>
          <label
            className="mb-1.5 block text-sm font-medium text-slate-700"
            htmlFor="signature-department"
          >
            Department
          </label>
          <select
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:bg-slate-50 disabled:text-slate-500 sm:w-72"
            disabled={departments.length === 1}
            id="signature-department"
            onChange={(event) => setDepartment(event.target.value)}
            value={department}
          >
            {departments.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {loadingDetails ? (
          <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                className="mb-1.5 block text-sm font-medium text-slate-700"
                htmlFor="sig-company"
              >
                Company name
              </label>
              <Input
                id="sig-company"
                maxLength={200}
                onChange={(event) =>
                  update({ company_name: event.target.value })
                }
                placeholder="Company Inc."
                value={form.company_name}
              />
            </div>
            <div>
              <label
                className="mb-1.5 block text-sm font-medium text-slate-700"
                htmlFor="sig-telephone"
              >
                Telephone
              </label>
              <Input
                id="sig-telephone"
                maxLength={100}
                onChange={(event) => update({ telephone: event.target.value })}
                placeholder="(02) 8123 4567"
                value={form.telephone}
              />
            </div>
            <div className="sm:col-span-2">
              <label
                className="mb-1.5 block text-sm font-medium text-slate-700"
                htmlFor="sig-address"
              >
                Office address
              </label>
              <Input
                id="sig-address"
                maxLength={300}
                onChange={(event) =>
                  update({ office_address: event.target.value })
                }
                placeholder="Unit 1, Building, Street, City"
                value={form.office_address}
              />
            </div>
            <div className="sm:col-span-2">
              <label
                className="mb-1.5 block text-sm font-medium text-slate-700"
                htmlFor="sig-website"
              >
                Website
              </label>
              <Input
                id="sig-website"
                maxLength={200}
                onChange={(event) => update({ website: event.target.value })}
                placeholder="https://www.company.com"
                value={form.website}
              />
            </div>
          </div>
        )}

        {hasPreview && !loadingDetails && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
              Preview
            </p>

            <div className="rounded-lg bg-white p-4 text-[13px] leading-6 text-slate-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="Company logo"
                className="mb-4 block h-20 w-auto object-contain"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
                src={SIGNATURE_LOGO}
              />

              {/* Per-employee: from the signed-in user's employee record */}
              <p className="uppercase">{previewName}</p>

              {/* Position + company on one line */}
              {positionLine && <p>{positionLine}</p>}

              {form.office_address && (
                <p>Office Address: {form.office_address}</p>
              )}

              {/* Per-employee */}
              {previewMobile && <p>Mobile No.: {previewMobile}</p>}

              {/* Per-department: from this form */}
              {form.telephone && <p>Telephone No.: {form.telephone}</p>}
              {form.website && (
                <p>
                  Website:{" "}
                  <span className="text-blue-700 underline">
                    {form.website}
                  </span>
                </p>
              )}
            </div>

            <p className="mt-3 text-xs text-slate-400">
              Name, position and mobile are from your own employee record. In
              real emails, they come from whoever sends the request.
            </p>
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-end">
        <Button
          disabled={saving || loadingDetails || !dirty}
          onClick={() => void save()}
          type="button"
        >
          {saving && <Loader className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </div>
    </section>
  );
}

/* ============================================================================
 * Page
 * ========================================================================== */

type TabKey = "notifications" | "signature";

const TABS: { key: TabKey; label: string; icon: typeof Mail }[] = [
  { key: "notifications", label: "Notification emails", icon: Mail },
  { key: "signature", label: "Email signature", icon: PenLine },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<TabKey>("notifications");
  const [lists, setLists] = useState<SettingItem[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await readJson(
          await fetch(ENDPOINT, { cache: "no-store" }),
        );
        setLists((result.data ?? []) as SettingItem[]);
      } catch (failure) {
        setLists([]);
        toast.error(
          failure instanceof Error
            ? failure.message
            : "Unable to load settings.",
        );
      }
    })();
  }, []);

  return (
    <div className="space-y-6 pb-8">
      <header className="rounded-3xl bg-gradient-to-r from-slate-700 to-slate-900 px-6 py-8 text-white shadow-lg sm:px-9">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
            <Settings aria-hidden="true" className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Settings
            </h1>
            <p className="mt-1 text-sm text-white/80">
              Email recipients and email signature details for system
              notifications. Superadmin only.
            </p>
          </div>
        </div>
      </header>

      <nav
        aria-label="Email settings sections"
        className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1"
        role="tablist"
      >
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              aria-controls={`settings-panel-${key}`}
              aria-selected={active}
              className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                active
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
              id={`settings-tab-${key}`}
              key={key}
              onClick={() => setTab(key)}
              role="tab"
              type="button"
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Panels stay mounted (just hidden) so unsaved edits survive a tab switch. */}
      <div
        aria-labelledby="settings-tab-notifications"
        className="space-y-6"
        hidden={tab !== "notifications"}
        id="settings-panel-notifications"
        role="tabpanel"
      >
        {lists === null ? (
          <div className="space-y-3">
            <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />
            <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />
          </div>
        ) : lists.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            No settings available.
          </p>
        ) : (
          lists.map((list) =>
            list.type === "departments" ? (
              <DepartmentCard key={list.key} list={list} />
            ) : (
              <EmailListCard key={list.key} list={list} />
            ),
          )
        )}
      </div>

      <div
        aria-labelledby="settings-tab-signature"
        hidden={tab !== "signature"}
        id="settings-panel-signature"
        role="tabpanel"
      >
        <SignatureCard />
      </div>
    </div>
  );
}
