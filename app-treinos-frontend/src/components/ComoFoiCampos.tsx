// Dores, sensação e notas de um treino: usado na revisão do Garmin e na edição pelo histórico.
import { DORES, ITEMS, type ItemId, type Nivel, type Sessao } from "../lib/dominio";
import type { ComoFoi } from "../lib/comoFoi";
import { dorPrincipal } from "../lib/treino";


const NIVEIS: [Nivel, string][] = [["ok", "Sem dor"], ["leve", "Incomodou"], ["dor", "Doeu"]];
const SENS: [NonNullable<Sessao["sensacao"]>, string][] = [["leve", "Leve"], ["ok", "No ponto"], ["pesado", "Pesado"]];


export default function ComoFoiCampos({ item, valor, mudar, id }: { item: ItemId; valor: ComoFoi; mudar: (v: ComoFoi) => void; id: string }) {
  const principal = dorPrincipal(item);
  const dor = (k: string, v: Nivel | null) => {
    const d = { ...valor.dores };
    if (v) d[k] = v; else delete d[k];
    mudar({ ...valor, dores: d });
  };
  const ciclo = (k: string) => { const v = valor.dores[k]; dor(k, v === "leve" ? "dor" : v === "dor" ? null : "leve"); };
  return (
    <div className="comofoi">
      {principal && (
        <div className="field"><span className="lbl">{DORES[principal]}</span>
          <div className="seg" role="group" aria-label={DORES[principal]}>
            {NIVEIS.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={valor.dores[principal] === v} onClick={() => dor(principal, valor.dores[principal] === v ? null : v)}>{l}</button>
            ))}
          </div>
        </div>
      )}
      <div className="field">
        <span className="lbl">Outras dores <span style={{ color: "var(--faint)" }}>(um toque: incomodou; dois: doeu)</span></span>
        <div className="dchips">
          {Object.keys(DORES).filter((k) => k !== principal).map((k) => {
            const v = valor.dores[k];
            return (
              <button key={k} type="button" className={"dchip " + (v === "leve" || v === "dor" ? v : "")} aria-pressed={v === "leve" || v === "dor"} onClick={() => ciclo(k)}>
                {DORES[k]}{v === "leve" ? " · incomodou" : v === "dor" ? " · doeu" : ""}
              </button>
            );
          })}
        </div>
      </div>
      {ITEMS[item].kind === "cardio" && (
        <div className="field"><span className="lbl">Sensação</span>
          <div className="seg" role="group" aria-label="Sensação">
            {SENS.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={valor.sensacao === v} onClick={() => mudar({ ...valor, sensacao: valor.sensacao === v ? null : v })}>{l}</button>
            ))}
          </div>
        </div>
      )}
      <div className="field"><label htmlFor={"notas-" + id}>Notas</label>
        <textarea id={"notas-" + id} rows={3} maxLength={2000} value={valor.notas}
          placeholder="O que aconteceu? Ex.: parei no km 3 porque… A IA leva isso em conta."
          onChange={(e) => mudar({ ...valor, notas: e.target.value })} />
      </div>
    </div>
  );
}
