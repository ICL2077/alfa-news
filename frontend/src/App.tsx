import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCompany } from "./api";
import { Sidebar } from "./components/Sidebar/sidebar";
import type { View } from "./components/Sidebar/sidebar";
import { Insights } from "./components/Insights/insights";
import { useNews } from "./components/Insights/useNews";
import { Login } from "./components/Login/login";
import { ProfilePage } from "./components/ProfilePage/profile-page";
import { useThread } from "./components/Thread/useThread";
import type { Employee } from "./types";

const KEY = "companyId";
const readId = () => {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
};

export default function App() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>("home");
  const [companyId, setCompanyId] = useState<string | null>(readId);
  const companyQuery = useQuery({
    queryKey: ["company", companyId],
    queryFn: () => fetchCompany(companyId!),
    enabled: !!companyId,
    retry: false,
    refetchInterval: (query) => query.state.data?.status === "DRAFT" ? 3000 : false,
  });
  const company = companyQuery.data;
  const employee: Employee | undefined = company ? {
    id: company.id,
    username: company.name,
    companyId: company.id,
    role: null,
    interests: [],
  } : undefined;
  const news = useNews(employee);
  const chat = useThread(company?.id ?? "");

  useEffect(() => {
    if (companyQuery.isError) {
      try { sessionStorage.removeItem(KEY); } catch { /* storage may be unavailable */ }
    }
  }, [companyQuery.isError]);

  const login = (id: string) => {
    try { sessionStorage.setItem(KEY, id); } catch { /* session lasts until refresh */ }
    setCompanyId(id);
    setView("home");
    void qc.invalidateQueries({ queryKey: ["company", id] });
  };
  const logout = () => {
    try { sessionStorage.removeItem(KEY); } catch { /* storage may be unavailable */ }
    setCompanyId(null);
    setView("home");
  };

  if (!companyId || companyQuery.isError) return <Login onLogin={login} />;
  if (companyQuery.isPending || !company || !employee) return <p className="muted" style={{ padding: "2rem" }}>Загружаем компанию…</p>;

  return (
    <div className="app-layout">
      {view !== "home" && <Sidebar view={view} onNav={setView} employee={employee} onLogout={logout} news={view === "news" ? news : undefined} />}
      <main className="main-content">
        {view === "home" && (
          <div className="page">
            <div className="row wrap home-bar">
              <span className="muted">{company.name}</span>
              <div className="row">
                <button className="btn ghost" onClick={() => setView("profile")}>Профиль компании</button>
                <button className="btn ghost" onClick={logout}>Сменить компанию</button>
              </div>
            </div>
            <h1>Главная</h1>
            <button className="entry" onClick={() => setView("news")}>
              <strong>Новостная аналитика</strong>
              <span>События рынка и что они значат именно для вашей компании</span>
            </button>
            {company.status === "DRAFT" && <p className="muted">Собираем профиль компании. Эта страница обновится автоматически.</p>}
          </div>
        )}
        {view === "news" && <Insights news={news} chat={chat} />}
        {view === "profile" && <ProfilePage employee={employee} company={company} />}
      </main>
    </div>
  );
}
