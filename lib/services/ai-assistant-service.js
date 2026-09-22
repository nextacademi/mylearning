import { auth } from "../firebase";

async function request(url, options = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Unable to complete this request.");
  return data;
}

// Fire-and-forget from AiAssistantPanel.jsx — logging must never block or
// break the chat itself, so every call site wraps this in .catch(() => {}).
export const logAiConversation = (question, answer) =>
  request("/api/ai-assistant/conversations", { method: "POST", body: JSON.stringify({ question, answer }) });

export const loadAiConversations = () => request("/api/ai-assistant/conversations");
export const markAiConversationFollowedUp = (id) => request("/api/ai-assistant/conversations", { method: "PATCH", body: JSON.stringify({ id }) });
