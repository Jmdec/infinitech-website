import path from "node:path";

const esc = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );

const LOGO_CID = "company-logo@hrportal";

export async function getEmailSignature({
  laravelUrl,
  token,
  name,
}: {
  laravelUrl: string;
  token: string;
  name: string;
}) {
  let d: Record<string, string | null> = {};
  try {
    const res = await fetch(`${laravelUrl}/api/admin/my-signature`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.ok) d = (await res.json()).data ?? {};
  } catch {
    /* send without the extra lines */
  }

  const clean = (v?: string | null) => (v || "").trim();
  const position = [clean(d.position), clean(d.company)]
    .filter(Boolean)
    .join(" - ");

  const lines: [string, string][] = [
    ["", name.toUpperCase()],
    ["", position],
    ["Office Address: ", clean(d.address)],
    ["Mobile No.: ", clean(d.mobile)],
    ["Telephone No.: ", clean(d.telephone)],
    ["Website: ", clean(d.website)],
  ];
  const filled = lines.filter(([, value]) => value);

  const html = `
    <div style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1f2937">
      <img src="cid:${LOGO_CID}" alt="" width="110" style="display:block;margin-bottom:16px">
      ${filled
        .map(([label, value]) =>
          label === "Website: "
            ? `${label}<a href="${esc(value)}" style="color:#1155cc">${esc(value)}</a>`
            : `${esc(label)}${esc(value)}`,
        )
        .join("<br>")}
    </div>`;

  const text = "\n\n" + filled.map(([l, v]) => `${l}${v}`).join("\n");

  const attachments = [
    {
      filename: "logo.png",
      path: path.join(process.cwd(), "public", "email", "logo.png"),
      cid: LOGO_CID,
    },
  ];

  return { html, text, attachments };
}
