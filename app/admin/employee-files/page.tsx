"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  Download,
  FolderUp,
  Loader,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  authHeaders,
  uploadEmployeeFile,
  type EmployeeFileRecord,
} from "@/lib/employeeFileUpload";

type MasterEmployee = {
  id: number;
  id_number: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
  status: string;
};

type QueueItem = {
  key: string;
  file: File;
  name: string;
  state: "pending" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
};

const fullName = (e: MasterEmployee) =>
  [e.first_name, e.middle_name, e.last_name, e.suffix]
    .filter(Boolean)
    .join(" ");

const fmtSize = (b: number) => {
  if (b < 1024) return `${b} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do {
    b /= 1024;
    i++;
  } while (b >= 1024 && i < u.length - 1);
  return `${b.toFixed(1)} ${u[i]}`;
};

export default function EmployeeFilesPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [employees, setEmployees] = useState<MasterEmployee[]>([]);
  const [files, setFiles] = useState<EmployeeFileRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // form
  const [selected, setSelected] = useState<MasterEmployee | null>(null);
  const [empQuery, setEmpQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const busy = uploading;

  // delete dialog
  const [toDelete, setToDelete] = useState<EmployeeFileRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // list filters
  const [filter, setFilter] = useState("");
  const [empFilter, setEmpFilter] = useState<number | null>(null);
  const [sideQuery, setSideQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, fileRes] = await Promise.all([
        fetch("/api/employee-masterfile", {
          headers: authHeaders(),
          cache: "no-store",
        }),
        fetch("/api/admin/employee-files", {
          headers: authHeaders(),
          cache: "no-store",
        }),
      ]);
      const emp = await empRes.json().catch(() => ({}));
      const fl = await fileRes.json().catch(() => ({}));
      setEmployees(
        ((emp?.data ?? []) as MasterEmployee[]).filter(
          (e) => String(e.status).trim().toLowerCase() === "active",
        ),
      );
      setFiles(fl?.data ?? []);
    } catch {
      toast.error("Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("adminSessionActive")) {
      router.push("/admin/login");
      return;
    }
    void load();
  }, [router, load]);

  const matches = useMemo(() => {
    const q = empQuery.trim().toLowerCase();
    return employees
      .filter(
        (e) =>
          !q ||
          fullName(e).toLowerCase().includes(q) ||
          String(e.id_number).toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [employees, empQuery]);

  // Employees that have at least one file, with counts (for the sidebar).
  const groups = useMemo(() => {
    const map = new Map<number, { id: number; name: string; count: number }>();
    files.forEach((f) => {
      const g = map.get(f.employee_id);
      if (g) g.count++;
      else
        map.set(f.employee_id, {
          id: f.employee_id,
          name: f.employee_name,
          count: 1,
        });
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [files]);

  const sideGroups = useMemo(() => {
    const q = sideQuery.trim().toLowerCase();
    return groups.filter((g) => !q || g.name.toLowerCase().includes(q));
  }, [groups, sideQuery]);

  // If the selected employee has no files left (e.g. after delete), clear the filter.
  useEffect(() => {
    if (empFilter !== null && !groups.some((g) => g.id === empFilter)) {
      setEmpFilter(null);
    }
  }, [groups, empFilter]);

  const visibleFiles = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return files.filter(
      (f) =>
        (empFilter === null || f.employee_id === empFilter) &&
        (!q ||
          f.file_name.toLowerCase().includes(q) ||
          f.employee_name.toLowerCase().includes(q)),
    );
  }, [files, filter, empFilter]);

  const patchItem = (key: string, patch: Partial<QueueItem>) =>
    setQueue((q) => q.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const items: QueueItem[] = Array.from(list).map((f) => ({
      key: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2)}`,
      file: f,
      name: f.name.replace(/\.[^.]+$/, ""),
      state: "pending",
      progress: 0,
    }));
    setQueue((q) => [...q, ...items]);
    if (fileInputRef.current) fileInputRef.current.value = ""; // allow re-picking the same file
  };

  const submit = async () => {
    if (!selected) return toast.error("Select an employee.");
    const todo = queue.filter((i) => i.state !== "done");
    if (todo.length === 0) return toast.error("Choose at least one file.");
    if (todo.some((i) => !i.name.trim()))
      return toast.error("Every file needs a name.");

    setUploading(true);
    let ok = 0;
    let failed = 0;

    for (const item of todo) {
      patchItem(item.key, {
        state: "uploading",
        progress: 0,
        error: undefined,
      });
      try {
        await uploadEmployeeFile(
          item.file,
          { employeeId: selected.id, fileName: item.name.trim() },
          { onProgress: (p) => patchItem(item.key, { progress: p }) },
        );
        patchItem(item.key, { state: "done", progress: 100 });
        ok++;
      } catch (e) {
        patchItem(item.key, {
          state: "error",
          error: e instanceof Error ? e.message : "Upload failed.",
        });
        failed++;
      }
    }

    if (ok)
      toast.success(
        `${ok} file${ok > 1 ? "s" : ""} uploaded for ${fullName(selected)}.`,
      );
    if (failed)
      toast.error(
        `${failed} file${failed > 1 ? "s" : ""} failed. You can retry them.`,
      );

    // keep only the failed ones so "Upload" retries just those
    setQueue((q) => q.filter((i) => i.state === "error"));
    setUploading(false);
    await load();
  };

  const download = async (f: EmployeeFileRecord) => {
    try {
      const res = await fetch(`/api/admin/employee-files/${f.id}/download`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = f.original_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download the file.");
    }
  };

  const confirmRemove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/employee-files/${toDelete.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error();
      setFiles((prev) => prev.filter((x) => x.id !== toDelete.id));
      toast.success("File deleted.");
      setToDelete(null);
    } catch {
      toast.error("Failed to delete the file.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20">
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 shadow-lg">
        <div className="flex items-center gap-3 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
            <FolderUp className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">
              Employee Files
            </h1>
            <p className="mt-1 text-sm text-blue-100">
              Upload documents and images for an employee
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5 py-5 sm:py-8">
        {/* Upload form */}
        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
            {/* Employee (from masterfile) */}
            <div className="relative">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Employee *
              </label>
              <Input
                disabled={busy}
                placeholder="Search by name or ID number"
                value={
                  selected
                    ? `${selected.id_number} — ${fullName(selected)}`
                    : empQuery
                }
                onChange={(e) => {
                  setSelected(null);
                  setEmpQuery(e.target.value);
                  setPickerOpen(true);
                }}
                onFocus={() => setPickerOpen(true)}
                onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
              />
              {pickerOpen && !selected && (
                <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                  {matches.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-slate-500">
                      No employees found.
                    </li>
                  ) : (
                    matches.map((e) => (
                      <li
                        key={e.id}
                        className="cursor-pointer px-3 py-2 text-sm hover:bg-blue-50"
                        onMouseDown={() => {
                          setSelected(e);
                          setEmpQuery("");
                          setPickerOpen(false);
                        }}
                      >
                        <span className="font-mono text-xs text-slate-500">
                          {e.id_number}
                        </span>{" "}
                        <span className="font-medium text-slate-900">
                          {fullName(e)}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>

            {/* Employee name (auto) */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Employee name
              </label>
              <Input
                readOnly
                className="bg-slate-50"
                placeholder="Filled in from the masterfile"
                value={selected ? fullName(selected) : ""}
              />
            </div>

            {/* Files queue */}
            <div className="space-y-3 sm:col-span-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Files * (any type, any size, select as many as you want)
                </label>
                <input
                  ref={fileInputRef}
                  disabled={busy}
                  type="file"
                  multiple
                  className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
                  onChange={(e) => addFiles(e.target.files)}
                />
              </div>

              {queue.length > 0 && (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {queue.map((i) => (
                    <li key={i.key} className="space-y-1.5 p-3">
                      <div className="flex items-center gap-2">
                        <Input
                          value={i.name}
                          disabled={busy}
                          maxLength={255}
                          onChange={(e) =>
                            patchItem(i.key, { name: e.target.value })
                          }
                          className="h-8 flex-1"
                          aria-label="File name"
                        />
                        <span className="hidden shrink-0 text-xs text-slate-500 sm:inline">
                          {fmtSize(i.file.size)}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={busy}
                          aria-label="Remove"
                          className="h-8 w-8 shrink-0"
                          onClick={() =>
                            setQueue((q) => q.filter((x) => x.key !== i.key))
                          }
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="truncate text-xs text-slate-500">
                        {i.file.name}
                      </p>
                      {i.state === "uploading" && (
                        <div className="h-1.5 rounded bg-slate-200">
                          <div
                            className="h-1.5 rounded bg-blue-600 transition-all"
                            style={{ width: `${i.progress}%` }}
                          />
                        </div>
                      )}
                      {i.state === "error" && (
                        <p className="text-xs text-red-600">{i.error}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <Button
                className="bg-gradient-to-r from-blue-600 to-purple-600 text-white"
                disabled={busy || queue.length === 0}
                onClick={submit}
              >
                {busy ? (
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {busy
                  ? "Uploading…"
                  : queue.length > 0
                    ? `Upload ${queue.length} file${queue.length === 1 ? "" : "s"}`
                    : "Upload files"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sidebar + list */}
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* Employee filter sidebar */}
          <Card className="h-fit overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Filter by employee
              </p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder="Search name"
                  value={sideQuery}
                  onChange={(e) => setSideQuery(e.target.value)}
                />
              </div>
            </div>
            <ul className="max-h-64 overflow-y-auto p-2 lg:max-h-[28rem]">
              <li>
                <button
                  type="button"
                  onClick={() => setEmpFilter(null)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                    empFilter === null
                      ? "bg-blue-50 font-semibold text-blue-700"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span>All Files</span>
                  <span className="text-xs text-slate-500">{files.length}</span>
                </button>
              </li>
              {sideGroups.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => setEmpFilter(g.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                      empFilter === g.id
                        ? "bg-blue-50 font-semibold text-blue-700"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="truncate">{g.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {g.count}
                    </span>
                  </button>
                </li>
              ))}
              {sideGroups.length === 0 && (
                <li className="px-3 py-2 text-sm text-slate-500">
                  No employees found.
                </li>
              )}
            </ul>
          </Card>

          {/* List */}
          <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <div className="relative max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder="Search file or employee"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
            </div>
            <CardContent className="p-0">
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead className="px-4">Employee name</TableHead>
                      <TableHead>File name</TableHead>
                      <TableHead className="hidden md:table-cell">
                        Size
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">
                        Uploaded
                      </TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="h-32 text-center text-sm text-slate-500"
                        >
                          Loading…
                        </TableCell>
                      </TableRow>
                    ) : visibleFiles.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="h-32 text-center text-sm text-slate-500"
                        >
                          No files yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      visibleFiles.map((f) => (
                        <TableRow key={f.id}>
                          <TableCell className="px-4 text-sm font-medium text-slate-900">
                            {f.employee_name}
                          </TableCell>

                          <TableCell className="min-w-[220px]">
                            <p className="max-w-[420px] break-words text-sm font-semibold text-slate-900">
                              {f.file_name}
                            </p>
                            <p className="max-w-[420px] break-all text-xs text-slate-500">
                              {f.original_name}
                            </p>
                          </TableCell>

                          <TableCell className="hidden whitespace-nowrap text-sm text-slate-600 md:table-cell">
                            {fmtSize(f.size)}
                          </TableCell>

                          <TableCell className="hidden whitespace-nowrap text-sm text-slate-500 lg:table-cell">
                            {new Date(f.created_at).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              },
                            )}
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center justify-center gap-1.5">
                              <Button
                                aria-label="Download"
                                size="icon"
                                variant="outline"
                                className="h-9 w-9"
                                onClick={() => download(f)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                aria-label="Delete"
                                size="icon"
                                variant="outline"
                                className="h-9 w-9 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                onClick={() => setToDelete(f)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete confirmation */}
      <Dialog
        open={!!toDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) setToDelete(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete file?</DialogTitle>
            <DialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-slate-900">
                {toDelete?.file_name}
              </span>
              {toDelete ? ` (${toDelete.employee_name})` : ""}. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => setToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={deleting}
              onClick={() => void confirmRemove()}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? (
                <Loader className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
