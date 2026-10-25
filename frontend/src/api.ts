import type { ArticleMatch, Company, CompanyInput, ServerMessage } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
    credentials: "same-origin",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Запрос завершился с кодом ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const createCompany = (input: CompanyInput) =>
  request<Company>("/company", { method: "POST", body: JSON.stringify(input) });

export const fetchCompany = (id: string) =>
  request<Company>(`/company/${encodeURIComponent(id)}`);

export const fetchMatches = (companyId: string) =>
  request<ArticleMatch[]>(`/news/matchedArticles?companyId=${encodeURIComponent(companyId)}`);

export const fetchMessages = (chatId: string) =>
  request<ServerMessage[]>(`/chat/${encodeURIComponent(chatId)}/messages`);

export const openChat = (matchId: string) =>
  request<{ id: string }>(`/chat/open/${encodeURIComponent(matchId)}`, { method: "POST" });

export const sendMessage = (chatId: string, content: string) =>
  request<ServerMessage>(`/chat/${encodeURIComponent(chatId)}/message`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });

export function messageEvents(chatId: string) {
  return new EventSource(`/api/chat/${encodeURIComponent(chatId)}/events`, { withCredentials: true });
}
