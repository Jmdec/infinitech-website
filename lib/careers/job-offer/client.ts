export async function sendJobOffer(opts: {
  applicationId: number;
  pdfBytes: Uint8Array | ArrayBuffer; // from pdf-lib: await pdfDoc.save()
  subject: string;
  body: string;
  filename?: string;
}) {
  const fd = new FormData();
  fd.append(
    "pdf",
    new Blob([opts.pdfBytes as BlobPart], { type: "application/pdf" }),
    opts.filename ?? "Job-Offer.pdf",
  );
  fd.append("subject", opts.subject);
  fd.append("body", opts.body);

  // No headers option: the browser sets Content-Type with the boundary.
  const res = await fetch(
    `/api/admin/careers/applications/${opts.applicationId}/job-offer`,
    { method: "POST", body: fd, credentials: "include" },
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(data.message ?? `Request failed (${res.status})`);
  return data;
}
