import { interestsOf } from "../../utils";
import { Profile } from "../Profile/profile";
import type { Company, Employee } from "../../types";

export function ProfilePage({ employee, company }: { employee: Employee; company?: Company }) {
  const interests = interestsOf(employee, company);
  return (
    <div className="page">
      <h1>Профиль</h1>
      <div className="detail">
        <h2>{employee.username}</h2>
        <p className="muted">{employee.role ?? "Должность не указана"}</p>

        <section className="block">
          <h4>Компания</h4>
          {company ? (
            <>
              <p>{company.name}</p>
              {company.status === "DRAFT" && <p className="muted">Профиль компании собирается.</p>}
              <Profile c={company} />
            </>
          ) : (
            <p className="muted">Компания не найдена.</p>
          )}
        </section>

        <section className="block">
          <h4>Темы, которые вам важны</h4>
          {interests.length ? (
            <div className="tags">{interests.map((i) => <span key={i} className="tag">{i}</span>)}</div>
          ) : (
            <p className="muted">Темы пока не выбраны.</p>
          )}
          {interests.length > 0 && !employee.interests.length && (
            <p className="muted">Показаны ключевые темы компании: свои вы ещё не задавали.</p>
          )}
        </section>
      </div>
    </div>
  );
}
