import type { Company } from '../../types'

export function Profile({ c }: { c: Company }) {
  const p = c.profileJson
  const bank = p?.bank
  const lists: [string, string[] | undefined][] = [['Поставщики', p?.suppliers], ['Конкуренты', p?.competitors], ['Риски', p?.risks]]
  return (
    <div className="profile-body">
      <p className="muted">{[(c.okved || bank?.okvedCode) && `ОКВЭД ${c.okved || bank?.okvedCode}`, c.region || bank?.region].filter(Boolean).join(' · ') || 'ОКВЭД и регион пока не указаны'}</p>
      {p?.summary && <p><b>Интерпретация профиля (AI):</b> {p.summary}</p>}
      {bank?.okved && <p><b>Отрасль из данных кейса:</b> {bank.okved}</p>}
      {!!bank?.products?.length && <p><b>Продукты банка из данных кейса:</b> {bank.products.join(', ')}</p>}
      {p?.financing && <p><b>Финансирование по анализу профиля:</b> {p.financing}</p>}
      {c.keywords.length > 0 && <div className="tags">{c.keywords.map(k => <span key={k} className="tag">{k}</span>)}</div>}
      {lists.map(([t, v]) => (v?.length ? <p key={t}><b>{t}:</b> {v.join(', ')}</p> : null))}
    </div>
  )
}
