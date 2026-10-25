import { useEffect, useRef, useState } from "react";
import { ExternalLink, Send } from "lucide-react";
import { QUICK, STEPS } from "../../chat";
import type { Msg } from "../../chat";
import { impactOf } from "../../utils";
import type { ArticleMatch } from "../../types";
import type { ThreadApi } from "./useThread";
import styles from "./thread.module.css";

const PROV = {
  fact: "Из новости",
  bank: "Позиция Альфа-Банка",
  ai: "Вывод AI",
};
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

function Typing() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % STEPS.length), 1100);
    return () => clearInterval(t);
  }, []);
  return (
    <div className={styles.row}>
      <div className={`${styles.bubble} ${styles.bot}`}>
        <span className={styles.dots}>
          <i />
          <i />
          <i />
        </span>
        <span className="muted">{STEPS[i]}…</span>
      </div>
    </div>
  );
}

function Bubble({ m }: { m: Msg }) {
  const mine = m.role === "user";
  return (
    <div className={`${styles.row} ${mine ? styles.mine : ""}`}>
      <div className={`${styles.bubble} ${mine ? styles.me : styles.bot}`}>
        {m.parts.map((p, i) => (
          <p key={i}>
            {!mine && <span className={`badge ${p.kind}`}>{PROV[p.kind]}</span>}{" "}
            {p.text}
          </p>
        ))}
        {!!m.sources?.length && (
          <div className={styles.sources}>
            {m.sources.map((s) =>
              s.url ? (
                <a key={s.title} href={s.url} target="_blank" rel="noreferrer">
                  <ExternalLink size={12} /> {s.title}
                </a>
              ) : (
                <span key={s.title}>{s.title}</span>
              ),
            )}
          </div>
        )}
        {!!m.steps?.length && (
          <details className={styles.steps}>
            <summary>Как AI пришёл к ответу</summary>
            <ol>
              {m.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </details>
        )}
        <time className={styles.time}>{hhmm(m.at)}</time>
      </div>
    </div>
  );
}

export function Thread({
  item,
  open,
  chat,
}: {
  item: ArticleMatch;
  open: boolean;
  onClose: () => void;
  chat: ThreadApi;
}) {
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const msgs = chat.messages(item);
  const waiting = chat.pendingFor === item.id;
  const imp = impactOf(item);
  const openChatForItem = chat.open;
  const closeChatForItem = chat.close;

  useEffect(() => {
    openChatForItem(item);
    return () => {
      closeChatForItem(item.id);
    };
  }, [openChatForItem, closeChatForItem, item]);

  useEffect(() => {
    scroller.current?.scrollTo({
      top: scroller.current.scrollHeight,
      behavior: "smooth",
    });
  }, [msgs.length, waiting]);

  const send = (text: string) => {
    if (text.trim() && !chat.busy) {
      chat.send(item, text);
      setDraft("");
    }
  };

  return (
    <section className={`${styles.thread} ${open ? styles.in : styles.out}`}>
      <header className={styles.head}>
        <div className={styles.title}>
          <span className={`kind ${imp.cls}`}>{imp.label}</span>
          <h2>{item.rawArticle.title}</h2>
        </div>
      </header>

      <div className={styles.msgs} ref={scroller}>
        {msgs.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        {msgs.length === 1 && !waiting && (
          <div className={styles.quick}>
            {QUICK.map((q) => (
              <button
                key={q}
                className="btn ghost"
                onClick={() => send(q)}
                disabled={chat.busy}
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {waiting && <Typing />}
        {chat.errorFor === item.id && (
          <p className="error">Не удалось получить ответ. Повторите вопрос.</p>
        )}
      </div>

      <div className={styles.composer}>
        <input
          value={draft}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(draft)}
          placeholder="Спросите про эту новость"
        />
        <button
          className={`btn ${styles.send}`}
          onClick={() => send(draft)}
          disabled={chat.busy || !draft.trim()}
        >
          <Send size={16} /> Отправить
        </button>
      </div>
    </section>
  );
}
