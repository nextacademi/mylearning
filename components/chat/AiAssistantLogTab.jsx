"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";
import DataTable, { StatusBadge } from "../data-table/DataTable";
import { SkeletonList } from "../ui/Skeleton";
import { loadAiConversations, markAiConversationFollowedUp } from "../../lib/services/ai-assistant-service";
import { createConversationIfMissing } from "../../lib/chat-data";
import { useToast } from "../ui/Toast";

function displayDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

// What people are asking the floating AI Assistant, across every role —
// every turn is logged server-side (app/api/ai-assistant/conversations)
// the moment AiAssistantPanel.jsx gets a reply. "Follow up" opens (or
// reuses) a real Chat conversation with that person via the same
// createConversationIfMissing every other "message this user" entry point
// in the app already uses — never a second, parallel messaging system.
export default function AiAssistantLogTab({ currentUserId, currentUserRole, currentUserName, onFollowUp }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  function load() {
    setLoading(true);
    loadAiConversations()
      .then((data) => {
        setRows(data.conversations || []);
        setError("");
      })
      .catch((err) => setError(err.message || "Unable to load AI assistant conversations."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { void Promise.resolve().then(load); }, []);

  async function followUp(row) {
    setBusyId(row.id);
    try {
      const [conversationId] = await Promise.all([
        createConversationIfMissing({
          uidA: currentUserId,
          roleA: currentUserRole,
          nameA: currentUserName,
          uidB: row.userId,
          roleB: row.userRole,
          nameB: row.userName,
        }),
        markAiConversationFollowedUp(row.id).catch(() => {}),
      ]);
      onFollowUp(conversationId);
    } catch (err) {
      toast.error(err.message || "Unable to start a conversation with this user.");
    } finally {
      setBusyId("");
    }
  }

  const columns = useMemo(() => [
    { key: "createdAt", header: "Asked", sortable: true, accessor: (r) => r.createdAt || "", render: (r) => <span className="whitespace-nowrap text-xs text-muted">{displayDate(r.createdAt)}</span> },
    { key: "userName", header: "User", sortable: true, filter: {}, accessor: (r) => r.userName || r.userId || "", render: (r) => <span><b className="block text-ink">{r.userName || "Unknown"}</b><span className="text-[11px] text-subtle">{r.userRole}</span></span> },
    { key: "question", header: "Question", accessor: (r) => r.question || "", render: (r) => <span className="block max-w-sm text-xs text-ink">{r.question}</span> },
    { key: "answer", header: "Assistant's Answer", searchable: false, accessor: (r) => r.answer || "", render: (r) => <span className="block max-w-sm truncate text-xs text-muted" title={r.answer}>{r.answer || "—"}</span> },
    { key: "followUpAt", header: "Status", sortable: true, accessor: (r) => (r.followUpAt ? "Followed up" : "Not yet"), render: (r) => <StatusBadge tone={r.followUpAt ? "green" : "gray"}>{r.followUpAt ? "Followed up" : "Not yet"}</StatusBadge> },
  ], []);

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-ink">AI Assistant Conversations</h3>
        <p className="mt-1 text-xs text-muted">Every question people have asked the AI Assistant, across every role — follow up directly from here.</p>
      </div>
      {error && <p className="rounded-xl bg-active p-3 text-xs text-primary">{error}</p>}
      {loading ? (
        <SkeletonList count={6} />
      ) : (
        <DataTable
          title="AI assistant conversations"
          name="ai-assistant-conversations"
          columns={columns}
          rows={rows}
          initialSort={{ key: "createdAt", dir: "desc" }}
          pageSize={10}
          emptyLabel="No AI Assistant conversations yet."
          rowActions={(row) => (
            <button
              type="button"
              disabled={busyId === row.id}
              onClick={() => followUp(row)}
              className="inline-flex items-center gap-1 rounded-lg bg-info px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> {busyId === row.id ? "Opening…" : "Follow up"}
            </button>
          )}
        />
      )}
    </section>
  );
}
