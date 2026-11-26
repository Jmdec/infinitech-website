const CHUNK_SIZE = 3 * 1024 * 1024; // 3 MB per request (Vercel body limit is ~4.5 MB)
const CONCURRENCY = 3;
const MAX_RETRIES = 4;
const BASE = "/api/admin/employee-files";

export type EmployeeFileRecord = {
  id: number;
  employee_id: number;
  employee_name: string;
  file_name: string;
  original_name: string;
  mime: string | null;
  size: number;
  created_at: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function authHeaders(): Headers {
  const h = new Headers({ Accept: "application/json" });
  const token = localStorage.getItem("adminSessionActive");
  if (token) h.set("Authorization", `Bearer ${token}`);
  return h;
}

// Same file + same employee => same upload id, so an interrupted upload resumes.
// CHUNK_SIZE is part of the key, so leftovers from the old 4 MB chunks are
// never mixed with the new 3 MB chunks (different indexes would corrupt the file).
function uploadIdFor(file: File, employeeId: number) {
  const key = `empfile:${employeeId}:${file.name}:${file.size}:${file.lastModified}:${CHUNK_SIZE}`;
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return { id, key };
}

export async function uploadEmployeeFile(
  file: File,
  meta: { employeeId: number; fileName: string },
  opts: { onProgress?: (pct: number) => void; signal?: AbortSignal } = {},
): Promise<EmployeeFileRecord> {
  if (file.size === 0) throw new Error("Empty files can't be uploaded.");

  const { id, key } = uploadIdFor(file, meta.employeeId);
  const total = Math.ceil(file.size / CHUNK_SIZE);
  const done = new Set<number>();

  try {
    const res = await fetch(`${BASE}/status?upload_id=${id}`, {
      headers: authHeaders(),
      cache: "no-store",
      signal: opts.signal,
    });
    if (res.ok)
      ((await res.json()).received as number[]).forEach((i) => done.add(i));
  } catch {
    /* start fresh */
  }

  let result: EmployeeFileRecord | null = null;
  const report = () => opts.onProgress?.(Math.round((done.size / total) * 100));
  report();

  async function sendChunk(index: number) {
    const blob = file.slice(
      index * CHUNK_SIZE,
      Math.min(file.size, (index + 1) * CHUNK_SIZE),
    );

    for (let attempt = 0; ; attempt++) {
      try {
        const fd = new FormData();
        fd.append("upload_id", id);
        fd.append("index", String(index));
        fd.append("total", String(total));
        fd.append("employee_id", String(meta.employeeId));
        fd.append("file_name", meta.fileName);
        fd.append("filename", file.name);
        fd.append("size", String(file.size));
        fd.append("mime", file.type || "application/octet-stream");
        fd.append("chunk", blob, `${index}.part`);

        const res = await fetch(`${BASE}/chunk`, {
          method: "POST",
          headers: authHeaders(),
          body: fd,
          signal: opts.signal,
        });
        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          const msg =
            json.message ||
            Object.values(json.errors ?? {}).flat()[0] ||
            `Chunk ${index} failed (${res.status}).`;
          if (res.status >= 400 && res.status < 500 && res.status !== 429) {
            throw Object.assign(new Error(String(msg)), { fatal: true });
          }
          throw new Error(String(msg));
        }

        if (res.status === 201) result = json.data as EmployeeFileRecord;
        done.add(index);
        report();
        return;
      } catch (e: any) {
        if (e?.name === "AbortError" || e?.fatal || attempt >= MAX_RETRIES)
          throw e;
        await sleep(800 * 2 ** attempt);
      }
    }
  }

  const queue = Array.from({ length: total }, (_, i) => i).filter(
    (i) => !done.has(i),
  );
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length) await sendChunk(queue.shift()!);
    }),
  );

  // Resumed upload where every chunk already existed: re-send the last one to trigger assembly.
  if (!result) await sendChunk(total - 1);
  if (!result)
    throw new Error("Upload finished but the server did not confirm it.");

  localStorage.removeItem(key);
  return result;
}
