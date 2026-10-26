import type { ArticleMatch, Company, Employee } from "./types";

export const IMPACT: Record<string, { label: string; cls: string }> = {
  risk: { label: "Риск", cls: "risk" },
  negative: { label: "Риск", cls: "risk" },
  opportunity: { label: "Возможность", cls: "opportunity" },
  positive: { label: "Возможность", cls: "opportunity" },
  mixed: { label: "Смешанное влияние", cls: "neutral" },
  neutral: { label: "К сведению", cls: "neutral" },
};
export const impactOf = (x: ArticleMatch) =>
  IMPACT[x.impact ?? ""] ?? IMPACT.neutral;
export const HORIZON: Record<string, string> = {
  short: "Краткосрок",
  mid: "Среднесрок",
  medium: "Среднесрок",
  long: "Долгосрок",
};
export const pct = (score: number) => Math.round(score * 100); // шкала 0..1, уточнить у бэка
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ru-RU");
// Свои интересы сотрудника важнее; если не заданы, берём ключевые слова компании
export const interestsOf = (e: Employee, c?: Company): string[] =>
  e.interests.length ? e.interests : (c?.keywords ?? []);

// ВРЕМЕННО: персонализация на фронте по совпадению основ слов. Настоящая оценка под сотрудника должна считаться на бэке.
const stem = (s: string) => s.toLowerCase().slice(0, 5);
export const matchesInterests = (m: ArticleMatch, interests: string[]) => {
  const text = [m.category, m.rawArticle.title, m.summary, m.explanation]
    .join(" ")
    .toLowerCase();
  return interests.some((i) => text.includes(stem(i)));
};
export const relevanceFor = (m: ArticleMatch, interests: string[]) =>
  m.score + (matchesInterests(m, interests) ? 0.15 : 0);
