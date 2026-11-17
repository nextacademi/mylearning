import "server-only";

// True when both Resend settings exist — callers that must not pretend an
// email went out check this first and report "not configured" instead.
export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

// Generic email send via Resend — no new email provider or architecture
// introduced. `bcc` (not `to`) is used for broadcasts so recipients never
// see each other's addresses. Optional `html`, `cc`, `replyTo` and
// `attachments` ([{ filename, content: Buffer | base64 string }]) pass
// straight through to Resend. Returns Resend's message id.
export async function sendEmail({ to, cc, bcc, subject, text, html, replyTo, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("Resend email settings are not configured.");
  }
  const files = (attachments || []).map(({ filename, content }) => ({
    filename,
    content: Buffer.isBuffer(content) || content instanceof Uint8Array ? Buffer.from(content).toString("base64") : content,
  }));
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: to || [from],
      ...(cc?.length ? { cc } : {}),
      ...(bcc?.length ? { bcc } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      text,
      ...(html ? { html } : {}),
      ...(files.length ? { attachments: files } : {}),
    }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(`Resend request failed with status ${response.status}${detail?.message ? `: ${detail.message}` : "."}`);
  }
  const data = await response.json().catch(() => ({}));
  return data?.id || null;
}

const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

// Best-effort broadcast to many recipients — Resend caps recipients per
// call, so this sends in small bcc batches. Every batch failure is
// collected and returned rather than thrown, so one bad address never
// aborts the rest of the broadcast.
export async function broadcastEmail(emails, { subject, text }) {
  const batches = chunk([...new Set(emails.filter(Boolean))], 45);
  const failures = [];
  for (const batch of batches) {
    try {
      await sendEmail({ bcc: batch, subject, text });
    } catch (error) {
      failures.push({ batchSize: batch.length, message: error.message });
    }
  }
  return { sent: batches.length - failures.length, failed: failures.length };
}
