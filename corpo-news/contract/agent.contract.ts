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

export function isAgentTrace(value: unknown): value is AgentTrace {
  if (!value || typeof value !== 'object') return false;
  const trace = value as AgentTrace;
  return (
    Number.isInteger(trace.durationMs) &&
    trace.durationMs >= 0 &&
    Array.isArray(trace.steps) &&
    trace.steps.length <= 100 &&
    trace.steps.every(
      (step) =>
        step &&
        Number.isInteger(step.seq) &&
        typeof step.type === 'string' &&
        typeof step.title === 'string' &&
        ['ok', 'skipped', 'error'].includes(step.status) &&
        Number.isInteger(step.durationMs) &&
        step.durationMs >= 0 &&
        step.detail != null &&
        typeof step.detail === 'object' &&
        !Array.isArray(step.detail),
    )
  );
}
