"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Search, UserPlus, Users } from "lucide-react";
import {
  createConversationIfMissing,
  createGroupConversation,
  deleteMessage,
  hideConversationForMe,
  leaveGroup,
  markConversationRead,
  markGroupConversationRead,
  newMessageId,
  sendMessage,
  subscribeConversationMessages,
  subscribeMyConversations,
  updateGroupPhoto,
} from "../../lib/chat-data";
import { chatMediaErrorMessage, readMediaDuration, uploadChatMedia, validateChatFile } from "../../lib/chat-media";
import { hideFloatingAssistant } from "../../lib/fab-visibility";
import { useConfirm } from "../ui/ConfirmDialog";
import { uploadGroupPhoto } from "../../lib/chat-directory";
import { useAudioRecorder } from "../../lib/useAudioRecorder";
import MessageBubble from "./MessageBubble";
import ChatComposer from "./ChatComposer";
import NewChatModal from "./NewChatModal";
import CreateGroupModal from "./CreateGroupModal";
import GroupSettingsPanel from "./GroupSettingsPanel";
import ConversationMenu from "./ConversationMenu";

const groupCreatorRoles = new Set(["Admin", "Director", "Teacher"]);

function initials(name) {
  return (name || "?").trim().slice(0, 2).toUpperCase();
}

function timeAgo(timestamp) {
  const date = timestamp?.toDate?.();
  if (!date) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString();
}

// Display name/avatar for a conversation row or header — a group shows its
// own name/photo; a direct conversation shows the other participant's.
function conversationDisplay(conversation, currentUserId) {
  if (conversation.type === "group") {
    return { name: conversation.groupName || "Group", photo: conversation.groupPhoto || "", sub: `${conversation.participantIds?.length || 0} members` };
  }
  const otherUid = conversation.participantIds?.find((id) => id !== currentUserId);
  return { name: otherUid ? conversation.participantNames?.[otherUid] || "Conversation" : "Conversation", photo: "", sub: otherUid ? conversation.participantRoles?.[otherUid] || "" : "" };
}

export default function ChatWorkspace({ currentUserId, currentUserRole, currentUserName }) {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState("");
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const bottomRef = useRef(null);
  const recorder = useAudioRecorder();
  const confirm = useConfirm();

  // Step the floating AI assistant FAB aside while Chat is open — its
  // fixed bottom-right position otherwise sits on top of the composer's
  // send button.
  useEffect(() => hideFloatingAssistant(), []);

  useEffect(() => {
    if (!currentUserId) return undefined;
    return subscribeMyConversations(currentUserId, setConversations, () => {});
  }, [currentUserId]);

  useEffect(() => {
    if (!selected) {
      void Promise.resolve().then(() => setMessages([]));
      return undefined;
    }
    return subscribeConversationMessages(selected, (rows) => setMessages([...rows].reverse()), () => {});
  }, [selected]);

  // Switching conversations must never leak a reply target or an
  // in-progress attachment into the newly-opened thread.
  useEffect(() => {
    void Promise.resolve().then(() => {
      setReplyTo(null);
      setPendingAttachment((current) => {
        if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
        return null;
      });
      setError("");
    });
  }, [selected]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const conversation = conversations.find((item) => item.id === selected);
  const isGroup = conversation?.type === "group";

  useEffect(() => {
    if (!selected || !currentUserId || !conversation) return;
    if (isGroup) return; // group unread is cleared explicitly (menu action / opening), not by message content
    const hasUnreadForMe = messages.some((m) => m.receiverId === currentUserId && !m.readAt);
    if (hasUnreadForMe) markConversationRead(selected, currentUserId);
  }, [selected, messages, currentUserId, isGroup, conversation]);

  // Opening a group conversation clears its unread counter immediately
  // (there's no per-message readAt to react to for a group).
  useEffect(() => {
    if (selected && isGroup && currentUserId) markGroupConversationRead(selected, currentUserId);
  }, [selected, isGroup, currentUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selected]);

  const display = conversation ? conversationDisplay(conversation, currentUserId) : null;
  const otherUid = conversation && !isGroup ? conversation.participantIds?.find((id) => id !== currentUserId) : null;

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((item) => {
      const { name } = conversationDisplay(item, currentUserId);
      return name.toLowerCase().includes(term) || (item.lastMessage || "").toLowerCase().includes(term);
    });
  }, [conversations, search, currentUserId]);

  async function openContact(user) {
    setError("");
    try {
      const id = await createConversationIfMissing({
        uidA: currentUserId,
        roleA: currentUserRole,
        nameA: currentUserName,
        uidB: user.uid,
        roleB: user.role,
        nameB: user.displayName,
      });
      setSelected(id);
      setShowNewChat(false);
    } catch (err) {
      setError(err.message || "Unable to start this conversation.");
    }
  }

  async function handleCreateGroup({ name, description, members, photoFile }) {
    setCreatingGroup(true);
    setGroupError("");
    try {
      const id = await createGroupConversation({
        creatorUid: currentUserId,
        creatorName: currentUserName,
        creatorRole: currentUserRole,
        name,
        description,
        members,
      });
      if (photoFile) {
        const photoUrl = await uploadGroupPhoto(id, photoFile);
        await updateGroupPhoto(id, photoUrl);
      }
      setSelected(id);
      setShowCreateGroup(false);
      setShowNewChat(false);
    } catch (err) {
      setGroupError(err.message || "Unable to create this group.");
    } finally {
      setCreatingGroup(false);
    }
  }

  function attach(file, kind, extra = {}) {
    const problem = validateChatFile(file, kind);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setPendingAttachment({ file, kind, previewUrl: URL.createObjectURL(file), ...extra });
  }
  function handlePickImage(file) {
    attach(file, "image");
  }
  async function handlePickVideo(file) {
    const duration = await readMediaDuration(file);
    attach(file, "video", { duration });
  }
  function handleRecordingReady(blob, seconds) {
    const file = new File([blob], `voice-${Date.now()}.${(blob.type.split("/")[1] || "webm").split(";")[0]}`, { type: blob.type });
    attach(file, "audio", { duration: seconds });
  }
  function cancelAttachment() {
    if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl);
    setPendingAttachment(null);
  }

  async function handleSend() {
    if (!conversation) return;
    const recipientIds = isGroup ? conversation.participantIds.filter((id) => id !== currentUserId) : [];
    if (!isGroup && !otherUid) return;

    if (pendingAttachment && !isGroup) {
      setUploading(true);
      setUploadProgress(0);
      setError("");
      const messageId = newMessageId(selected);
      try {
        const { fileUrl, storagePath } = await uploadChatMedia(selected, messageId, pendingAttachment.file, setUploadProgress);
        await sendMessage(selected, currentUserId, otherUid, draft.trim(), {
          type: pendingAttachment.kind,
          fileUrl,
          storagePath,
          fileName: pendingAttachment.file.name,
          mimeType: pendingAttachment.file.type,
          fileSize: pendingAttachment.file.size,
          duration: pendingAttachment.duration,
          replyTo: replyTo || undefined,
          messageId,
        });
        URL.revokeObjectURL(pendingAttachment.previewUrl);
        setPendingAttachment(null);
        setDraft("");
        setReplyTo(null);
      } catch (err) {
        setError(chatMediaErrorMessage(err));
      } finally {
        setUploading(false);
      }
      return;
    }

    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError("");
    try {
      if (isGroup) {
        await sendMessage(selected, currentUserId, null, trimmed, { replyTo: replyTo || undefined, recipientIds, groupName: conversation.groupName });
      } else {
        await sendMessage(selected, currentUserId, otherUid, trimmed, { replyTo: replyTo || undefined });
      }
      setDraft("");
      setReplyTo(null);
    } catch (err) {
      setError(err.message || "Unable to send this message.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }
  function handleJumpTo(messageId) {
    document.getElementById(`msg-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  async function handleDelete(item) {
    if (!(await confirm({ title: "Delete message", message: "Delete this message? This cannot be undone.", tone: "danger", confirmLabel: "Delete" }))) return;
    try {
      await deleteMessage(selected, item.id, item.storagePath);
    } catch (err) {
      setError(err.message || "Unable to delete this message.");
    }
  }

  async function confirmDeleteConversation() {
    if (!confirmDelete) return;
    try {
      await hideConversationForMe(confirmDelete.id, currentUserId);
      if (selected === confirmDelete.id) setSelected("");
      setNotice("Conversation deleted.");
    } catch (err) {
      setError(err.message || "Unable to delete this conversation.");
    } finally {
      setConfirmDelete(null);
    }
  }
  async function handleLeaveFromMenu(item) {
    if (!(await confirm({ title: "Leave group", message: "Leave this group? You'll stop receiving its messages.", tone: "danger", confirmLabel: "Leave" }))) return;
    try {
      await leaveGroup(item, currentUserId);
      if (selected === item.id) setSelected("");
      setNotice("You left the group.");
    } catch (err) {
      setError(err.message || "Unable to leave this group.");
    }
  }
  async function handleMarkReadFromMenu(item) {
    try {
      if (item.type === "group") await markGroupConversationRead(item.id, currentUserId);
      else await markConversationRead(item.id, currentUserId);
    } catch {
      // best-effort
    }
  }

  const canCreateGroup = groupCreatorRoles.has(currentUserRole);

  return (
    <div className="grid gap-0 overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-md lg:h-[calc(100vh-140px)] lg:grid-cols-[280px_1fr]">
      <div className="flex flex-col border-b border-border-subtle bg-card lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-2 p-3.5">
          <b className="text-sm font-extrabold text-ink">Chats</b>
          <button
            type="button"
            onClick={() => setShowNewChat(true)}
            aria-label="Start a new chat"
            title="New chat"
            className="grid h-8 w-8 place-items-center rounded-full bg-primary text-white shadow-sm transition-transform hover:scale-105 hover:bg-primary-hover active:scale-95"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="relative px-3 pb-2.5">
          <Search className="pointer-events-none absolute left-6 top-2.5 h-3.5 w-3.5 text-subtle" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Messenger"
            className="w-full rounded-full border-none bg-page py-2 pl-8 pr-3 text-[11px] outline-none ring-1 ring-transparent transition focus:bg-card focus:ring-2 focus:ring-primary"
          />
        </div>
        {notice && <p className="border-b border-border-subtle bg-success-soft px-3 py-1.5 text-[10px] font-semibold text-success">{notice}</p>}
        <div className="flex-1 space-y-0.5 overflow-y-auto p-1.5">
          {filteredConversations.length ? (
            filteredConversations.map((item) => {
              const info = conversationDisplay(item, currentUserId);
              const unread = Number(item.unreadCount?.[currentUserId] || 0);
              const itemIsGroup = item.type === "group";
              const isSelected = selected === item.id;
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(item.id);
                    }
                  }}
                  className={`group flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all duration-150 active:scale-[0.98] ${isSelected ? "bg-active shadow-sm" : "hover:bg-page"}`}
                >
                  <span className="relative shrink-0">
                    {info.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={info.photo} alt="" className={`h-10 w-10 rounded-full object-cover ring-2 transition ${isSelected ? "ring-primary" : "ring-transparent"}`} />
                    ) : (
                      <span className={`grid h-10 w-10 place-items-center rounded-full bg-linear-to-br from-primary to-primary-hover text-xs font-bold text-white ring-2 transition ${isSelected ? "ring-primary" : "ring-transparent"}`}>
                        {itemIsGroup ? <Users className="h-4 w-4" /> : initials(info.name)}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <b className={`truncate text-xs ${unread > 0 ? "text-ink" : "text-ink/90"}`}>{info.name}</b>
                      <span className="flex shrink-0 items-center gap-1">
                        <span className="text-[9px] text-subtle group-hover:hidden">{timeAgo(item.lastMessageAt)}</span>
                        <span className="hidden group-hover:inline-flex">
                          <ConversationMenu
                            isGroup={itemIsGroup}
                            onOpen={() => setSelected(item.id)}
                            onMarkRead={() => handleMarkReadFromMenu(item)}
                            onDelete={() => setConfirmDelete(item)}
                            onLeave={() => handleLeaveFromMenu(item)}
                          />
                        </span>
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className={`truncate text-[11px] ${unread > 0 ? "font-semibold text-ink" : "text-muted"}`}>{item.lastMessage || "No messages yet"}</span>
                      {unread > 0 && (
                        <span className="grid h-4.5 min-w-4.5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[9px] font-bold text-white shadow-sm">
                          {unread > 9 ? "9+" : unread}
                        </span>
                      )}
                    </span>
                  </span>
                </div>
              );
            })
          ) : (
            <p className="px-4 py-8 text-center text-xs text-muted">No conversations yet. Tap &ldquo;New&rdquo; to start one.</p>
          )}
        </div>
      </div>

      <div className="flex min-h-[380px] flex-col bg-page/40">
        {conversation ? (
          <>
            <div className="flex items-center gap-2.5 border-b border-border-subtle bg-card p-3 shadow-sm">
              {display.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={display.photo} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <span className="grid h-9 w-9 place-items-center rounded-full bg-linear-to-br from-primary to-primary-hover text-xs font-bold text-white">
                  {isGroup ? <Users className="h-4 w-4" /> : initials(display.name)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <b className="block truncate text-xs text-ink">{display.name}</b>
                <span className="text-[10px] text-subtle">{display.sub}</span>
              </div>
              {isGroup && (
                <button type="button" onClick={() => setShowGroupSettings(true)} className="rounded-full border border-border-subtle px-3 py-1.5 text-[10px] font-bold text-primary transition hover:bg-active active:scale-95">Manage</button>
              )}
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-3">
              {messages.length ? (
                messages.map((item) => (
                  <MessageBubble
                    key={item.id}
                    item={item}
                    mine={item.senderId === currentUserId}
                    senderName={isGroup ? conversation.participantNames?.[item.senderId] : undefined}
                    onReply={setReplyTo}
                    onDelete={handleDelete}
                    onJumpTo={handleJumpTo}
                  />
                ))
              ) : (
                <div className="grid h-full place-items-center text-xs text-muted">No messages yet — say hello. 👋</div>
              )}
              <div ref={bottomRef} />
            </div>
            <ChatComposer
              draft={draft}
              onChangeDraft={setDraft}
              onKeyDown={handleKeyDown}
              onSend={handleSend}
              sending={sending}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              pendingAttachment={pendingAttachment}
              onCancelAttachment={cancelAttachment}
              uploading={uploading}
              uploadProgress={uploadProgress}
              onPickImage={handlePickImage}
              onPickVideo={handlePickVideo}
              recorder={recorder}
              onRecordingReady={handleRecordingReady}
              error={error}
              disableAttachments={isGroup}
            />
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div>
              <MessageCircle className="mx-auto h-8 w-8 text-subtle" aria-hidden="true" />
              <p className="mt-2 text-xs text-muted">Select a conversation to start messaging.</p>
            </div>
          </div>
        )}
      </div>

      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onSelectUser={openContact}
          onCreateGroup={() => {
            setShowNewChat(false);
            setShowCreateGroup(true);
          }}
          canCreateGroup={canCreateGroup}
        />
      )}
      {showCreateGroup && (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onCreate={handleCreateGroup}
          creating={creatingGroup}
          error={groupError}
        />
      )}
      {showGroupSettings && conversation && (
        <GroupSettingsPanel
          conversation={conversation}
          currentUserId={currentUserId}
          onClose={() => setShowGroupSettings(false)}
          onNotice={setNotice}
          onLeave={() => {
            setShowGroupSettings(false);
            setSelected("");
            setNotice("You left the group.");
          }}
        />
      )}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-xs rounded-2xl bg-card p-5 shadow-2xl">
            <p className="text-sm font-bold text-ink">Delete this conversation?</p>
            <p className="mt-1 text-xs text-muted">This only removes it from your own list — the other participant keeps their copy.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-muted">Cancel</button>
              <button type="button" onClick={confirmDeleteConversation} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
