export interface AgentStep {
  seq: number;
  type: string; // company_context | prefilter | rag_search | llm_call | decision | chat_context
  title: string; // готовая подпись для интерфейса
  status: 'ok' | 'skipped' | 'error';
  durationMs: number;
  detail: Record<string, unknown>; // содержимое зависит от type, см. таблицу ниже
}

export interface AgentTrace {
  steps: AgentStep[];
  durationMs: number;
}
