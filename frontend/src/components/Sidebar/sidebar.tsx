import { LogOut, Newspaper, User } from "lucide-react";
import type { Employee } from "../../types";
import { IMPACT, impactOf, matchesInterests } from "../../utils";
import type { News } from "../Insights/useNews";

export type View = "home" | "news" | "profile";
const NAV = [
  ["news", "Новости", Newspaper],
  ["profile", "Профиль", User],
] as const;

interface SidebarProps {
  view: View;
  onNav: (v: View) => void;
  employee: Employee;
  onLogout: () => void;
  news?: News; // передаётся только на экране «Новости»
}

export function Sidebar({ view, onNav, employee, onLogout, news }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <button className="sidebar-brand" onClick={() => onNav("home")} aria-label="На главную" title="На главную">
          Альфа Бизнес
        </button>
        <nav className="nav">
          {NAV.map(([id, label, Icon]) => (
            <button key={id} className={`nav-item ${view === id ? "on" : ""}`} onClick={() => onNav(id)} aria-current={view === id ? "page" : undefined}>
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>
      </div>

      {news ? (
        <>
          <div className="sidebar-section">
            <div className="row filters">
              {["all", "risk", "opportunity", "neutral"].map((f) => (
                <button key={f} className={`btn ghost ${news.filter === f ? "on" : ""}`} onClick={() => news.setFilter(f)}>
                  {f === "all" ? "Все" : IMPACT[f].label}
                </button>
              ))}
            </div>
          </div>
          <div className="sidebar-list">
            {!news.list.length ? (
              <p className="muted">Нет новостей по фильтру.</p>
            ) : (
              <ul className="feed">
                {news.list.map((x) => (
                  <li key={x.id}>
                    <button className={`card ${news.selId === x.id ? "sel" : ""}`} onClick={() => news.setSelId(x.id)}>
                      <span className={`kind ${impactOf(x).cls}`}>{impactOf(x).label}</span>
                      <strong>{x.rawArticle.title}</strong>
                      {matchesInterests(x, news.interests) && <span className="muted">По вашим интересам</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <div className="sidebar-spacer" />
      )}

      <div className="sidebar-user">
        <strong>{employee.username}</strong>
        <span className="muted">{employee.role ?? "Должность не указана"}</span>
        <button className="btn ghost" onClick={onLogout}>
          <LogOut size={16} /> Выйти
        </button>
      </div>
    </aside>
  );
}
