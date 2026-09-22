"use client";

import { useState } from "react";
import ChatWorkspace from "./ChatWorkspace";
import ContactInquiries from "../dashboard/ContactInquiries";
import AiAssistantLogTab from "./AiAssistantLogTab";

const TABS = ["Messages", "Contact Inquiries", "AI Assistant"];

// Contact | Chat | AI Assistant, consolidated under one "Chat" sidebar
// entry — same pattern as User (Students/Teachers) and Achievement
// (Templates/Certificates/Awards): one module, sub-tabs inside, each tab
// still the exact same component that used to be its own sidebar item.
// Only Director/Admin get the extra tabs (Contact Inquiries and AI
// Assistant visibility are manager capabilities); every other role keeps
// seeing exactly what they saw before — plain ChatWorkspace, no tab bar.
export default function ChatHub({ currentUserId, currentUserRole, currentUserName, newInquiryCount }) {
  const [tab, setTab] = useState("Messages");
  const [pendingConversationId, setPendingConversationId] = useState("");
  const isManager = currentUserRole === "Admin" || currentUserRole === "Director";

  if (!isManager) {
    return <ChatWorkspace currentUserId={currentUserId} currentUserRole={currentUserRole} currentUserName={currentUserName} />;
  }

  function goToConversation(conversationId) {
    setPendingConversationId(conversationId);
    setTab("Messages");
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <nav className="flex shrink-0 flex-wrap gap-2 overflow-x-auto rounded-2xl border border-border-subtle bg-card p-2 shadow-sm">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`relative shrink-0 rounded-xl px-4 py-2 text-xs font-bold ${tab === item ? "bg-primary text-white" : "text-muted hover:bg-active"}`}
          >
            {item}
            {item === "Contact Inquiries" && newInquiryCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">{newInquiryCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1">
        {tab === "Messages" && (
          <ChatWorkspace
            key={pendingConversationId || "default"}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            currentUserName={currentUserName}
            initialConversationId={pendingConversationId}
          />
        )}
        {tab === "Contact Inquiries" && <ContactInquiries />}
        {tab === "AI Assistant" && (
          <AiAssistantLogTab
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            currentUserName={currentUserName}
            onFollowUp={goToConversation}
          />
        )}
      </div>
    </div>
  );
}
