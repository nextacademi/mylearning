"use client";

import { useEffect, useState } from "react";
import ChatWorkspace from "./ChatWorkspace";
import ContactInquiries from "../dashboard/ContactInquiries";
import AiAssistantLogTab from "./AiAssistantLogTab";
import AppointmentScheduler from "../appointments/AppointmentScheduler";
import { markAllNotificationsRead, useUnreadNotificationsByType } from "../../lib/notification-data";
import { useSessionTab } from "../../lib/page-refresh";

const TABS = ["Messages", "Contact Inquiries", "Appointments", "AI Assistant"];

// Contact | Chat | Appointments | AI Assistant, consolidated under one
// "Chat" sidebar entry — same pattern as User (Students/Teachers) and
// Achievement (Templates/Certificates/Awards): one module, sub-tabs inside,
// each tab still the exact same component that used to be its own sidebar
// item. Appointments (people booking time with the academy) moved here from
// Finance — it's a conversation with the public, not money. Only
// Director/Admin get the extra tabs (they're manager capabilities); every
// other role keeps seeing exactly what they saw before — plain
// ChatWorkspace, no tab bar (Student/Guest still book from their own
// "Appointments" sidebar module).
export default function ChatHub({ currentUserId, currentUserRole, currentUserName, newInquiryCount }) {
  const [tab, setTab] = useSessionTab("chat", "Messages", TABS);
  const [pendingConversationId, setPendingConversationId] = useState("");
  const isManager = currentUserRole === "Admin" || currentUserRole === "Director";
  const newAppointments = useUnreadNotificationsByType(isManager ? currentUserId : null, "appointment");

  // Opening the tab is the "I've seen it" signal — same idea as Contact
  // Inquiries' unread badge clearing once the list is opened.
  useEffect(() => {
    if (tab === "Appointments" && newAppointments.length) markAllNotificationsRead(newAppointments);
  }, [tab, newAppointments]);

  if (!isManager) {
    return <ChatWorkspace currentUserId={currentUserId} currentUserRole={currentUserRole} currentUserName={currentUserName} />;
  }

  function goToConversation(conversationId) {
    setPendingConversationId(conversationId);
    setTab("Messages");
  }

  const badgeFor = (item) =>
    item === "Contact Inquiries" ? newInquiryCount : item === "Appointments" ? newAppointments.length : 0;

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
            {badgeFor(item) > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">{badgeFor(item)}</span>
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
        {tab === "Appointments" && <AppointmentScheduler />}
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
