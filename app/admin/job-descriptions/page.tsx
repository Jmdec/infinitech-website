// File: app/admin/job-descriptions/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  FileText,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api-client";
import {
  emptyJobDescription,
  parseJobDescription,
  sectionBlocks,
  serializeJobDescription,
  summaryParagraphs,
  type JobDescriptionDoc,
} from "@/lib/careers/job-offer/description";

// Laravel: JobDescriptionController (via the Next proxy, superadmin only).
// GET  JOBS_ENDPOINT        -> { data: Job[] }
// POST JOBS_ENDPOINT        -> create
// PUT  JOBS_ENDPOINT/{id}   -> update (title, department, description, qualifications)
const JOBS_ENDPOINT = "/api/admin/job-descriptions";

// Departments drive which job-offer layout is used ("IT" -> Eirene format).
const DEPARTMENTS = [
  "IT",
  "Marketing",
  "Admin",
  "Management",
  "Sales",
  "Creative",
];

type Job = {
  id: number;
  title: string;
  department?: string | null;
  description?: string | null;
  qualifications?: string[] | null;
};

const label =
  "text-xs font-semibold uppercase text-slate-600 dark:text-slate-300";

export default function JobDescriptionPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [jobId, setJobId] = useState<string>("new");

  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [doc, setDoc] = useState<JobDescriptionDoc>(emptyJobDescription());
  const [qualText, setQualText] = useState("");

  async function reloadJobs(): Promise<Job[]> {
    const res = await apiFetch(JOBS_ENDPOINT, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || "Unable to load jobs.");
    const list: Job[] = json?.data ?? [];
    setJobs(list);
    return list;
  }

  useEffect(() => {
    if (!localStorage.getItem("adminSessionActive")) {
      router.push("/admin/login");
      return;
    }
    reloadJobs()
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Unable to load jobs."),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function loadJob(id: string) {
    setJobId(id);
    if (id === "new") {
      setTitle("");
      setDepartment("");
      setDoc(emptyJobDescription());
      setQualText("");
      return;
    }
    const job = jobs.find((j) => String(j.id) === id);
    if (!job) return;
    setTitle(job.title ?? "");
    setDepartment(job.department ?? "");
    setDoc(parseJobDescription(job.description, job.qualifications ?? []));
    setQualText((job.qualifications ?? []).join("\n"));
  }

  const qualifications = useMemo(
    () =>
      qualText
        .split(/\r?\n/)
        .map((q) => q.replace(/^\s*[-•●*]\s*/, "").trim())
        .filter(Boolean),
    [qualText],
  );
  const description = useMemo(() => serializeJobDescription(doc), [doc]);

  // ── section helpers ──
  const setSection = (
    i: number,
    patch: Partial<JobDescriptionDoc["sections"][number]>,
  ) =>
    setDoc((d) => ({
      ...d,
      sections: d.sections.map((s, idx) =>
        idx === i ? { ...s, ...patch } : s,
      ),
    }));
  const moveSection = (i: number, dir: -1 | 1) =>
    setDoc((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.sections.length) return d;
      const next = [...d.sections];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...d, sections: next };
    });

  async function save() {
    if (!title.trim()) return toast.error("Enter the job title.");
    if (!department.trim()) return toast.error("Select the department.");
    if (!description.trim())
      return toast.error("Add a summary or at least one duty.");

    setSaving(true);
    try {
      const isNew = jobId === "new";
      const res = await apiFetch(
        isNew ? JOBS_ENDPOINT : `${JOBS_ENDPOINT}/${jobId}`,
        {
          method: isNew ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            department: department.trim(),
            description,
            qualifications,
          }),
        },
      );
      const json = await res.json().catch(() => ({}));

      // The record was deleted while this page was open: drop the stale id
      // and keep the form so the next Save creates it as a new record.
      if (res.status === 404 && !isNew) {
        const staleId = jobId;
        setJobId("new");
        setJobs((prev) => prev.filter((j) => String(j.id) !== staleId));
        toast.error(
          "That job description no longer exists. Press Save again to create it as new.",
        );
        return;
      }

      if (!res.ok)
        throw new Error(json.message || "Unable to save the job description.");

      const saved: Job = json.data ?? json;
      setJobs((prev) =>
        isNew
          ? [saved, ...prev]
          : prev.map((j) => (String(j.id) === jobId ? { ...j, ...saved } : j)),
      );
      if (isNew && saved?.id) setJobId(String(saved.id));
      toast.success("Job description saved.");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Unable to save the job description.",
      );
    } finally {
      setSaving(false);
    }
  }

  const isIT = /^(it|information technology)$/i.test(department.trim());

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-slate-100">
            <FileText className="h-5 w-5 text-purple-600" />
            Job Description
          </h1>
          <p className="text-sm text-muted-foreground">
            Used as the attached Annex in the job offer. Department decides the
            layout ({isIT ? "IT format" : "standard format"}).
          </p>
        </div>
        <Button
          type="button"
          className="bg-gradient-to-r from-blue-600 to-purple-600"
          disabled={saving || loading}
          onClick={save}
        >
          {saving ? (
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── editor ── */}
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="space-y-1.5">
              <Label className={label}>Edit existing or create new</Label>
              <Select value={jobId} onValueChange={loadJob} disabled={loading}>
                <SelectTrigger>
                  <SelectValue placeholder={loading ? "Loading…" : "Select"} />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  sideOffset={4}
                  className="z-[999] w-[--radix-select-trigger-width] !bg-slate-900 !border-slate-700 !opacity-100 !text-white shadow-xl"
                >
                  <SelectItem
                    value="new"
                    className="!text-white focus:!bg-slate-700 focus:!text-white"
                  >
                    + New job description
                  </SelectItem>
                  {jobs.map((j) => (
                    <SelectItem
                      key={j.id}
                      value={String(j.id)}
                      className="!text-white focus:!bg-slate-700 focus:!text-white"
                    >
                      {j.title}
                      {j.department ? ` · ${j.department}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className={label}>
                  Job Title<span className="ml-0.5 text-red-500">*</span>
                </Label>
                <Input
                  value={title}
                  placeholder="e.g. Marketing Staff / Junior Web Developer"
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className={label}>
                  Department<span className="ml-0.5 text-red-500">*</span>
                </Label>
                <Input
                  list="jd-departments"
                  value={department}
                  placeholder="e.g. IT"
                  onChange={(e) => setDepartment(e.target.value)}
                />
                <datalist id="jd-departments">
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className={label}>Summary</Label>
              <Textarea
                rows={4}
                value={doc.summary}
                placeholder="Paste or type the summary. Line breaks are ignored; leave a blank line to start a new paragraph."
                onChange={(e) =>
                  setDoc((d) => ({ ...d, summary: e.target.value }))
                }
              />
            </div>

            <div className="space-y-3">
              <p className="pt-1 text-xs font-bold uppercase tracking-wide text-purple-600">
                Duties &amp; Responsibilities
              </p>
              {doc.sections.map((s, i) => (
                <div
                  key={i}
                  className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={s.heading}
                      placeholder="Section heading (e.g. Marketing Functions)"
                      onChange={(e) =>
                        setSection(i, { heading: e.target.value })
                      }
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Move up"
                      disabled={i === 0}
                      onClick={() => moveSection(i, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Move down"
                      disabled={i === doc.sections.length - 1}
                      onClick={() => moveSection(i, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Remove section"
                      disabled={doc.sections.length === 1}
                      onClick={() =>
                        setDoc((d) => ({
                          ...d,
                          sections: d.sections.filter((_, x) => x !== i),
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    rows={5}
                    value={s.items.join("\n")}
                    placeholder={
                      "One duty per line (each line = one bullet)\nAssist in planning campaigns\nManage social media posts"
                    }
                    onChange={(e) =>
                      setSection(i, { items: e.target.value.split("\n") })
                    }
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setDoc((d) => ({
                    ...d,
                    sections: [...d.sections, { heading: "", items: [""] }],
                  }))
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                Add section
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label className={label}>Qualifications (optional)</Label>
              <Textarea
                rows={4}
                value={qualText}
                placeholder="One per line"
                onChange={(e) => setQualText(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── live preview of the Annex ── */}
        <Card className="h-fit lg:sticky lg:top-4">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Preview (Annex)
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard
                    .writeText(description)
                    .then(() => toast.success("Copied."))
                    .catch(() => toast.error("Could not copy."));
                }}
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                Copy text
              </Button>
            </div>
            <div className="max-h-[70vh] overflow-auto rounded-md border border-slate-200 bg-white p-6 font-serif text-[13px] leading-snug text-black dark:border-slate-700">
              {!isIT && <p className="mb-3 text-center font-bold">“Annex A”</p>}
              <p className="mb-2 font-bold">
                Job Description – {title.trim() || "Job Title"}
              </p>
              {summaryParagraphs(doc.summary).map((para, i) => (
                <p key={i} className="mb-2 text-justify">
                  {para}
                </p>
              ))}
              {sectionBlocks(doc.sections).map((s, i) => (
                <div key={i} className="mt-3">
                  {s.heading && <p className="mb-1 font-bold">{s.heading}:</p>}
                  <ul className="list-disc space-y-1 pl-6">
                    {s.items.map((it, x) => (
                      <li key={x}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {qualifications.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1 font-bold">Qualifications:</p>
                  <ul className="list-disc space-y-0.5 pl-6">
                    {qualifications.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
