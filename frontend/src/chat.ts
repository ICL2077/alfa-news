import type { ArticleMatch } from './types'

export type Prov = 'fact' | 'bank' | 'ai'
export interface Part { kind: Prov; text: string }
export interface Source { title: string; url?: string }
export interface Msg {
  id: string
  role: 'user' | 'assistant'
  parts: Part[]
  sources?: Source[]
  steps?: string[]
  at: string
}

export const QUICK = ['Как это повлияет на нас?', 'Что нам делать?', 'Покажи в другом разрезе']
// Статусы, которые крутятся, пока агент думает. Потом заменить на реальные шаги из SSE
export const STEPS = ['Разбираю вопрос', 'Смотрю профиль компании', 'Ищу в аналитике банка', 'Проверяю ответ']
export const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// Первое сообщение диалога: готовая аналитика по новости, собранная из полей ArticleMatch
export const analysisMessage = (m: ArticleMatch): Msg => {
  const a = m.rawArticle
  const parts: Part[] = [{ kind: 'fact', text: a.description ?? a.title }]
  if (m.summary) parts.push({ kind: 'ai', text: m.summary })
  parts.push({ kind: 'ai', text: m.explanation ?? 'Персональное объяснение для этой компании ещё готовится.' })
  const rawSteps = m.agentRun?.steps
  const steps = Array.isArray(rawSteps)
    ? rawSteps.map((step) => typeof step === 'object' && step && 'title' in step ? String(step.title) : 'Шаг анализа')
    : undefined
  return { id: `analysis-${m.id}`, role: 'assistant', parts, sources: [{ title: a.title, url: a.link }], at: m.createdAt, ...(steps?.length ? { steps } : {}) }
}
