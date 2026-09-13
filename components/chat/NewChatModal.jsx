"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, UsersRound, X } from "lucide-react";
import { loadChatDirectory } from "../../lib/chat-directory";

function initials(name) {
  return (name || "?").trim().slice(0, 2).toUpperCase();
}

// The full "New Chat" picker — every active registered LMS user (via
// /api/chat/directory, since Firestore's own `users` rule doesn't let a
// non-admin list other users directly), searchable by name/email/uid,
// excluding the caller. "+ Create Group" is only shown when the caller is
// allowed to create one (Admin/Director/Teacher — mirrors the
// firestore.rules conversations `create` rule for type == 'group').
export default function NewChatModal({ onClose, onSelectUser, onCreateGroup, canCreateGroup }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadChatDirectory()
      .then((rows) => {
        if (!cancelled) setUsers(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Unable to load users.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) => `${user.displayName} ${user.email} ${user.uid}`.toLowerCase().includes(term));
  }, [users, search]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <b className="text-sm text-ink">New Chat</b>
          <button type="button" onClick={onClose} aria-label="Close" className="text-lg text-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative border-b border-border-subtle p-3">
          <Search className="pointer-events-none absolute left-6 top-6 h-4 w-4 text-subtle" />
          <input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search users..."
            className="w-full rounded-lg border border-border-subtle bg-page py-2 pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        {canCreateGroup && (
          <button
            type="button"
            onClick={onCreateGroup}
            className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-2.5 text-left text-xs font-bold text-primary hover:bg-active"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-active text-primary">
              <UsersRound className="h-4 w-4" />
            </span>
            + Create Group
          </button>
        )}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="px-4 py-8 text-center text-xs text-muted">Loading users...</p>
          ) : error ? (
            <p className="px-4 py-8 text-center text-xs text-primary">{error}</p>
          ) : filtered.length ? (
            filtered.map((user) => (
              <button
                key={user.uid}
                type="button"
                onClick={() => onSelectUser(user)}
                className="flex w-full items-center gap-2.5 border-b border-border-subtle px-4 py-2.5 text-left hover:bg-page"
              >
                {user.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.photoURL} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-bold text-white">{initials(user.displayName)}</span>
                )}
                <span className="min-w-0">
                  <b className="block truncate text-xs text-ink">{user.displayName}</b>
                  <span className="block truncate text-[10px] text-subtle">{user.email}</span>
                  <span className="text-[10px] font-semibold text-primary">{user.role}</span>
                </span>
              </button>
            ))
          ) : (
            <p className="px-4 py-8 text-center text-xs text-muted">No users match your search.</p>
          )}
        </div>
      </div>
    </div>
  );
}
