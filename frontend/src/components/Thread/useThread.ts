import { useCallback, useRef, useState } from "react";
import { fetchMessages, messageEvents, openChat, sendMessage } from "../../api";
import { analysisMessage, uid } from "../../chat";
import type { Msg } from "../../chat";
import type { ArticleMatch, ServerMessage } from "../../types";

const toMessage = (message: ServerMessage): Msg => {
  const rawSteps = message.trace?.steps;
  const steps = Array.isArray(rawSteps)
    ? rawSteps.map((step) => typeof step === "object" && step && "title" in step ? String(step.title) : "Шаг анализа")
    : undefined;
  return {
    id: message.id,
    role: message.role === "USER" ? "user" : "assistant",
    parts: [{ kind: "ai", text: message.content }],
    at: message.createdAt,
    ...(steps?.length ? { steps } : {}),
  };
};

export function useThread(ownerId: string) {
  const [threads, setThreads] = useState<Record<string, Msg[]>>({});
  const [pendingFor, setPendingFor] = useState<string>();
  const [errorFor, setErrorFor] = useState<string>();
  const sources = useRef(new Map<string, EventSource>());
  const opening = useRef(new Map<string, Promise<void>>());
  const activeMatches = useRef(new Set<string>());
  const chatIdsRef = useRef(new Map<string, string>());
  const key = useCallback((matchId: string) => `${ownerId}:${matchId}`, [ownerId]);

  const replaceMessages = useCallback((matchId: string, chatId: string, messages: ServerMessage[]) => {
    setThreads((current) => ({ ...current, [key(matchId)]: messages.map(toMessage) }));
    const pending = messages.some((message) => message.role === "USER" && message.status === "PENDING");
    if (pending) setPendingFor(matchId);
    else setPendingFor((current) => current === matchId ? undefined : current);
    if (messages.some((message) => message.status === "FAILED")) setErrorFor(matchId);
    else setErrorFor((current) => current === matchId ? undefined : current);
    void chatId;
  }, [key]);

  const refresh = useCallback(async (matchId: string, chatId: string) => {
    try {
      replaceMessages(matchId, chatId, await fetchMessages(chatId));
    } catch {
      setErrorFor(matchId);
    }
  }, [replaceMessages]);

  const open = useCallback(async (match: ArticleMatch) => {
    const matchId = match.id;
    activeMatches.current.add(matchId);
    if (sources.current.has(matchId)) return;
    const pending = opening.current.get(matchId);
    if (pending) return pending;
    const task = (async () => {
      try {
        const chat = await openChat(matchId);
        chatIdsRef.current.set(matchId, chat.id);
        if (!activeMatches.current.has(matchId)) return;
        const source = messageEvents(chat.id);
        sources.current.set(matchId, source);
        source.onopen = () => { void refresh(matchId, chat.id); };
        source.onmessage = () => { void refresh(matchId, chat.id); };
        source.addEventListener("failed", () => { void refresh(matchId, chat.id); });
        source.onerror = () => { /* EventSource reconnects; onopen reloads missed messages. */ };
        await refresh(matchId, chat.id);
      } catch {
        setErrorFor(matchId);
      }
    })();
    opening.current.set(matchId, task);
    try { await task; } finally { opening.current.delete(matchId); }
  }, [refresh]);

  const close = useCallback((matchId: string) => {
    activeMatches.current.delete(matchId);
    sources.current.get(matchId)?.close();
    sources.current.delete(matchId);
  }, []);

  const send = useCallback(async (match: ArticleMatch, text: string) => {
    const content = text.trim();
    if (!content || pendingFor) return;
    const matchId = match.id;
    setErrorFor(undefined);
    setPendingFor(matchId);
    const optimistic: Msg = {
      id: uid(), role: "user", parts: [{ kind: "ai", text: content }], at: new Date().toISOString(),
    };
    setThreads((current) => ({
      ...current,
      [key(matchId)]: [...(current[key(matchId)] ?? [analysisMessage(match)]), optimistic],
    }));
    try {
      let chatId = chatIdsRef.current.get(matchId);
      if (!chatId) {
        const chat = await openChat(matchId);
        chatId = chat.id;
        chatIdsRef.current.set(matchId, chat.id);
      }
      await sendMessage(chatId, content);
      await refresh(matchId, chatId);
    } catch {
      setPendingFor(undefined);
      setErrorFor(matchId);
    }
  }, [key, pendingFor, refresh]);

  return {
    messages: (match: ArticleMatch) => {
      const saved = threads[key(match.id)];
      return saved?.length ? saved : [analysisMessage(match)];
    },
    open,
    close,
    send,
    busy: !!pendingFor,
    pendingFor,
    errorFor,
  };
}

export type ThreadApi = ReturnType<typeof useThread>;
