import { Thread } from "../Thread/thread";
import type { ThreadApi } from "../Thread/useThread";
import type { News } from "./useNews";

// Основная часть экрана «Новости»: только диалог. Список новостей и фильтры теперь в сайдбаре.
export function Insights({ news, chat }: { news: News; chat: ThreadApi }) {
  const { companies, company, ready, matches, selected } = news;
  const note = (text: string, cls = "muted") => <p className={cls} style={{ padding: "2rem" }}>{text}</p>;

  return (
    <>
      {companies.isPending && note("Загрузка компаний…")}
      {companies.error && note("Ошибка загрузки.", "error")}
      {companies.data && !company && note("Компания сотрудника не найдена.", "error")}
      {company && !ready && note("Профиль собирается, ждите...")}
      {ready && matches.isPending && note("Подбираем новости…")}
      {ready && matches.data && !selected && note("Нет новостей по выбранному фильтру.")}
      {ready && selected && (
        <div style={{ padding: "1rem", height: "100%" }}>
          <Thread key={selected.id} item={selected} open={true} onClose={() => {}} chat={chat} />
        </div>
      )}
    </>
  );
}
