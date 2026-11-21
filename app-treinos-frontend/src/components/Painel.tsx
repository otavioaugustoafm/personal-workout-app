import { useEffect, useState } from "react";
import { addDays, ddmm, isoToday, MESES, mondayOf, dateOf } from "../lib/dominio";
import Backup from "./Backup";
import Historico from "./Historico";
import Hoje from "./Hoje";
import { Halter } from "./Icones";
import Plano from "./Plano";

type Aba = "hoje" | "historico" | "plano";
const ABAS: [Aba, string][] = [["hoje", "Hoje"], ["historico", "Histórico"], ["plano", "Plano"]];

export default function Painel({ onLogout }: { onLogout: () => void }) {
  const [aba, setAba] = useState<Aba>(() => {
    const h = location.hash.slice(1);
    return (["hoje", "historico", "plano"].includes(h) ? h : "hoje") as Aba;
  });
  const [backup, setBackup] = useState(false);
  // "chave" força a aba Hoje a voltar para o dia de hoje quando você toca nela de novo
  const [chave, setChave] = useState(0);

  useEffect(() => {
    try { history.replaceState(null, "", "#" + aba); } catch { /* sem histórico: ignora */ }
  }, [aba]);

  const hoje = isoToday(), mon = mondayOf(hoje), d = dateOf(hoje);
  const mes = MESES[d.getMonth()];

  return (
    <>
      <header className="appbar">
        <div className="appbar-in">
          <div className="brand">
            <span className="logo" aria-hidden="true"><Halter cor="#2a2208" /></span>
            <span className="t">Plano de Treino</span>
          </div>
          <div className="period">
            <b>{mes[0].toUpperCase() + mes.slice(1)} de {d.getFullYear()}</b>
            <span>Semana {ddmm(mon)} a {ddmm(addDays(mon, 6))}</span>
          </div>
          <div className="actions">
            <button className="linkbtn" type="button" aria-expanded={backup} onClick={() => setBackup(!backup)}>Backup</button>
            <button className="linkbtn" type="button" onClick={onLogout}>Sair</button>
          </div>
        </div>
      </header>
      <div className="wrap">
        {backup && <Backup onFechar={() => setBackup(false)} />}
        <nav className="tabs" role="tablist">
          {ABAS.map(([k, n]) => (
            <button key={k} role="tab" type="button" aria-selected={aba === k}
              onClick={() => { if (k === "hoje") setChave((c) => c + 1); setAba(k); }}>{n}</button>
          ))}
        </nav>
        {aba === "hoje" && <Hoje key={chave} />}
        {aba === "historico" && <Historico />}
        {aba === "plano" && <Plano />}
      </div>
    </>
  );
}
