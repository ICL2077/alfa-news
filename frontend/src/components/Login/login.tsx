import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { LogIn } from "lucide-react";
import { createCompany } from "../../api";
import type { CompanyInput } from "../../types";
import styles from "./login.module.css";

export function Login({ onLogin }: { onLogin: (id: string) => void }) {
  const [name, setName] = useState("");
  const [inn, setInn] = useState("");
  const [description, setDescription] = useState("");
  const [bankClientId, setBankClientId] = useState("");
  const mut = useMutation({
    mutationFn: (input: CompanyInput) => createCompany(input),
    onSuccess: (company) => onLogin(company.id),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && !mut.isPending) {
      mut.mutate({
        name: name.trim(),
        ...(inn.trim() ? { inn: inn.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(bankClientId.trim() ? { bankClientId: bankClientId.trim() } : {}),
      });
    }
  };

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={submit}>
        <span className={styles.brand}>Альфа Бизнес</span>
        <h1>Новостная аналитика для бизнеса</h1>
        <p className="muted">Создайте демо-профиль компании, чтобы открыть персональную ленту и чат.</p>

        <label className={styles.field}>
          Название компании
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} autoFocus required />
        </label>
        <label className={styles.field}>
          ИНН <span className="muted">необязательно</span>
          <input value={inn} onChange={(e) => setInn(e.target.value)} inputMode="numeric" maxLength={12} />
        </label>
        <label className={styles.field}>
          Описание бизнеса <span className="muted">необязательно</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} rows={3} />
        </label>
        <label className={styles.field}>
          ID клиента банка для поиска в данных кейса <span className="muted">необязательно</span>
          <input value={bankClientId} onChange={(e) => setBankClientId(e.target.value)} maxLength={64} />
        </label>

        {mut.isError && <p className="error" role="alert">{mut.error.message}</p>}

        <button type="submit" className={`btn ${styles.submit}`} disabled={mut.isPending || !name.trim()}>
          <LogIn size={16} /> {mut.isPending ? "Создаём профиль…" : "Продолжить"}
        </button>
        <p className="muted">Демо-профиль хранится на стенде. Не вводите реальные банковские данные.</p>
      </form>
    </div>
  );
}
