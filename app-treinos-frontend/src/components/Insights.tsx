// Lista de insights (calculados no app) e a tela detalhada de um treino do histórico.
import {
  DORES, fmtDateLong, fmtDist, fmtDur, fmtInt, fmtKg, fmtRitmo, ITEMS, NIVEL, SENSACAO,
  type Modalidade, type Sessao,
} from "../lib/dominio";
import type { ExtraGarmin } from "../lib/garmin";
import { comparaExercicio, insightsDoTreino, type Insight } from "../lib/insights";
import { useStore } from "../lib/storeContext";
import { kindLabel, volume } from "../lib/treino";

const ROTULO = { bom: "positivo", atencao: "atenção", info: "observação" } as const;

export function Insights({ itens, titulo = "Insights" }: { itens: Insight[]; titulo?: string }) {
  if (!itens.length) return null;
  return (
    <section className="insights" aria-label={titulo}>
      <h3>{titulo}</h3>
      <div className="ins-grid">
        {itens.map((x, i) => (
          <div key={i} className={"ins " + x.tom}>
            <span className="tag">{ROTULO[x.tom]}</span>
            <b>{x.titulo}</b>
            <span>{x.texto}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Dado({ v, l }: { v: string; l: string }) {
  return <div className="dado"><b>{v}</b><span>{l}</span></div>;
}

export function DetalheTreino({ s }: { s: Sessao }) {
  const { S } = useStore();
  const it = ITEMS[s.item];
  const g = (s.garmin || null) as ExtraGarmin | null;
  const mod = it.mod as Modalidade | undefined;
  const garmin: [string, string][] = g ? ([
    [g.dur_s ? fmtDur(g.dur_s) : "", "duração no relógio"],
    [g.fc ? `${g.fc} bpm` : "", "FC média"],
    [g.fc_max ? `${g.fc_max} bpm` : "", "FC máxima"],
    [g.calorias ? `${fmtInt(g.calorias)} kcal` : "", "calorias"],
    [g.te_aerobico ? fmtKg(g.te_aerobico) : "", "efeito aeróbico"],
    [g.te_anaerobico ? fmtKg(g.te_anaerobico) : "", "efeito anaeróbico"],
    [g.cadencia ? `${g.cadencia} ${mod === "corrida" ? "ppm" : "rpm"}` : "", "cadência"],
    [g.elevacao_m ? `${Math.round(g.elevacao_m)} m` : "", "subida"],
  ] as [string, string][]).filter(([v]) => v) : [];
  const dores = Object.entries(s.dores || {}).filter(([, v]) => v);
  const ins = insightsDoTreino(S, s);
  return (
    <div className="detalhe">
      {s.kind === "cardio" && s.cardio && (
        <div className="dados">
          {s.cardio.dist ? <Dado v={fmtDist(s.cardio.dist, mod)} l="distância" /> : null}
          {s.cardio.dur_s ? <Dado v={fmtDur(s.cardio.dur_s)} l="tempo" /> : null}
          {s.cardio.dist && s.cardio.dur_s ? <Dado v={fmtRitmo(s.cardio.dist, s.cardio.dur_s, mod)} l={mod === "corrida" || mod === "natacao" ? "pace" : "velocidade"} /> : null}
          {s.cardio.fc ? <Dado v={`${s.cardio.fc} bpm`} l="FC média" /> : null}
        </div>
      )}
      {s.kind === "forca" && !s.rapido && (
        <>
          <div className="dados">
            <Dado v={`${fmtInt(volume(s))} kg`} l="volume" />
            <Dado v={String((s.exercicios || []).reduce((a, e) => a + (e.pulado || e.semNota || e.aConfirmar ? 0 : e.series.filter((x) => x.t === "S").length), 0))} l="séries de trabalho" />
            <Dado v={String((s.exercicios || []).filter((e) => !e.pulado && !e.semNota && !e.aConfirmar).length)} l="exercícios feitos" />
          </div>
          <div className="tbl-wrap"><table className="data det-tab">
            <thead><tr><th>Exercício</th><th>Séries</th><th>Volume</th><th>vs anterior</th></tr></thead>
            <tbody>{(s.exercicios || []).map((e) => {
              const status = e.pulado ? "pulado" : e.semNota ? "sem anotação" : e.aConfirmar ? "aguardando o Garmin" : "";
              const c = status ? null : comparaExercicio(S, s, e);
              return (
                <tr key={e.id}>
                  <td><b>{e.nome}</b>{e.varNome ? <span className="sub"> · {e.varNome}</span> : null}</td>
                  <td>{status ? <span className="sub">{status}</span> : (
                    <span className="series-chips">{e.series.map((x, i) => (
                      <span key={i} className={"sc " + x.t}>
                        <small>{kindLabel(x.t, i, e.series)}</small>
                        {e.biset ? `${x.reps}+${x.reps2 ?? 0}` : `${fmtKg(x.kg)}×${x.reps}`}
                      </span>
                    ))}</span>
                  )}</td>
                  <td className="mono">{c ? `${fmtInt(c.atual.vol)} kg` : "—"}</td>
                  <td className="mono">
                    {c?.recorde ? <span className="chip ok">recorde</span>
                      : c?.dTop ? <span className={"delta " + (c.dTop > 0 ? "up" : "down")}>{c.dTop > 0 ? "+" : ""}{fmtKg(c.dTop)} kg</span>
                        : c?.ant ? "igual" : c ? "primeira vez" : "—"}
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </>
      )}
      {garmin.length > 0 && (
        <div>
          <h4>Do Garmin</h4>
          <div className="dados">{garmin.map(([v, l]) => <Dado key={l} v={v} l={l} />)}</div>
        </div>
      )}
      {(dores.length > 0 || s.sensacao || s.notas) && (
        <div className="row" style={{ gap: 8 }}>
          {dores.map(([k, v]) => <span key={k} className={"chip " + (v === "dor" ? "bad" : v === "leve" ? "warn" : "ok")}>{DORES[k] || k}: {NIVEL[v]}</span>)}
          {s.sensacao && <span className="chip">Sensação: {SENSACAO[s.sensacao]}</span>}
          {s.notas && <span className="sub">“{s.notas}”</span>}
        </div>
      )}
      <Insights itens={ins} titulo="Neste treino" />
      <span className="sub">Registrado em {fmtDateLong(s.data)}{g ? " · com dados do Garmin" : ""}.</span>
    </div>
  );
}
