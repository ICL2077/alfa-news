import type { Company } from '../../types'

export function Profile({ c }: { c: Company }) {
  const p = c.profileJson
  const lists: [string, string[] | undefined][] = [['Поставщики', p?.suppliers], ['Конкуренты', p?.competitors], ['Риски', p?.risks]]
  return (
    <div className="profile-body">
      <p className="muted">{[c.okved && `ОКВЭД ${c.okved}`, c.region].filter(Boolean).join(' · ') || 'ОКВЭД и регион пока не указаны'}</p>
      {c.keywords.length > 0 && <div className="tags">{c.keywords.map(k => <span key={k} className="tag">{k}</span>)}</div>}
      {lists.map(([t, v]) => (v?.length ? <p key={t}><b>{t}:</b> {v.join(', ')}</p> : null))}
    </div>
  )
}
