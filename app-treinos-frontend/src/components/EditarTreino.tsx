// Edição de um treino salvo (Histórico → Abrir treino → Editar).
import { useState } from "react";
import {
  clone, emMetros, fmtDur, fmtKg, ITEMS, parseDur, type ExercicioSessao, type Modalidade, type Serie, type Sessao,
} from "../lib/dominio";
import { useStore } from "../lib/storeContext";
import { kindLabel, seriesFrom } from "../lib/treino";
import { comoFoiDe } from "../lib/comoFoi";
import ComoFoiCampos from "./ComoFoiCampos";

type Status = "feito" | "pulado" | "sem";
const statusDe = (e: ExercicioSessao): Status => (e.pulado ? "pulado" : e.semNota || e.aConfirmar ? "sem" : "feito");

export default function EditarTreino({ s, fechar }: { s: Sessao; fechar: () => void }) {
  const store = useStore();
  const { S } = store;
  const it = ITEMS[s.item];
  const mod = it.mod as Modalidade | undefined;
  const metros = emMetros(mod);
  const [comoFoi, setComoFoi] = useState(() => comoFoiDe(s));
  const [salvando, setSalvando] = useState(false);

  // musculação: os exercícios da sessão + os da ficha que não estão nela (ex.: treino marcado sem anotar)
  const [exs, setExs] = useState<ExercicioSessao[]>(() => {
    if (s.kind !== "forca") return [];
    const atuais = clone(s.exercicios || []);
    const ficha = S.fichas[s.item as "A"] || [];
    ficha.forEach((f) => {
      if (!atuais.some((e) => e.id === f.id)) {
        atuais.push({ id: f.id, nome: f.nome, garmin: f.garmin || "", manual: !!f.manual, variante: 0,
          varNome: f.variantes.length > 1 ? f.variantes[0].nome || "Opção 1" : "", biset: f.variantes[0].biset || null, series: [], semNota: true });
      }
    });
    return atuais;
  });
  const [cardio, setCardio] = useState(() => ({
    dist: s.cardio?.dist ?? null, dur: s.cardio?.dur_s ? fmtDur(s.cardio.dur_s) : "", fc: s.cardio?.fc ?? null,
  }));

  const mudarEx = (i: number, fn: (e: ExercicioSessao) => void) => setExs((xs) => xs.map((e, j) => { if (j !== i) return e; const c = clone(e); fn(c); return c; }));
  const status = (i: number, st: Status) => mudarEx(i, (e) => {
    e.pulado = st === "pulado";
    e.semNota = st === "sem";
    e.aConfirmar = false;
    if (st === "feito" && !e.series.length) {
      const f = (S.fichas[s.item as "A"] || []).find((x) => x.id === e.id);
      e.series = f ? seriesFrom(S, f, e.variante || 0).map((x) => ({ ...x, feito: true })) : [{ t: "S", kg: 0, reps: 0, feito: true }];
    }
  });
  const serie = (i: number, k: number, campo: keyof Serie, valor: string) => mudarEx(i, (e) => {
    const n = parseFloat(valor.replace(",", "."));
    (e.series[k] as unknown as Record<string, number>)[campo] = isNaN(n) ? 0 : n;
  });

  const salvar = async () => {
    setSalvando(true);
    const novo: Sessao = { ...clone(s), ...comoFoi };
    if (s.kind === "forca") {
      // os exercícios da ficha que você não preencheu continuam fora da sessão
      const originais = new Set((s.exercicios || []).map((e) => e.id));
      novo.exercicios = exs.filter((e) => originais.has(e.id) || statusDe(e) !== "sem")
        .map((e) => ({ ...e, series: e.pulado ? [] : e.series.map((x) => ({ ...x, feito: true })) }));
      if (novo.exercicios.some((e) => statusDe(e) === "feito")) novo.rapido = false;
    } else {
      novo.cardio = { dist: cardio.dist, dur_s: parseDur(cardio.dur), fc: cardio.fc };
      if (cardio.dist || cardio.dur) novo.rapido = false;
    }
    const ok = await store.editarSessao(novo);
    setSalvando(false);
    if (ok) { store.aviso("Treino atualizado"); fechar(); }
  };

  return (
    <div className="editor">
      {s.kind === "cardio" && (
        <div className="grid3">
          <div className="field">
            <label htmlFor={"e-dist-" + s.id}>Distância ({metros ? "m" : "km"})</label>
            <input id={"e-dist-" + s.id} inputMode="decimal"
              defaultValue={cardio.dist == null ? "" : metros ? Math.round(cardio.dist * 1000) : String(cardio.dist).replace(".", ",")}
              onChange={(e) => { const n = parseFloat(e.target.value.replace(",", ".")); setCardio((c) => ({ ...c, dist: isNaN(n) || !n ? null : metros ? n / 1000 : n })); }} />
          </div>
          <div className="field">
            <label htmlFor={"e-dur-" + s.id}>Tempo (h:mm:ss)</label>
            <input id={"e-dur-" + s.id} defaultValue={cardio.dur} onChange={(e) => setCardio((c) => ({ ...c, dur: e.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor={"e-fc-" + s.id}>FC média (bpm)</label>
            <input id={"e-fc-" + s.id} inputMode="numeric" defaultValue={cardio.fc ?? ""}
              onChange={(e) => { const n = parseInt(e.target.value, 10); setCardio((c) => ({ ...c, fc: isNaN(n) ? null : n })); }} />
          </div>
        </div>
      )}

      {s.kind === "forca" && exs.map((e, i) => {
        const st = statusDe(e);
        return (
          <div className="gex" key={e.id}>
            <div className="row">
              <b>{e.nome}</b>{e.varNome && <span className="sub">{e.varNome}</span>}
              <span className="spacer" />
              <div className="seg" role="group" aria-label={"Situação de " + e.nome}>
                {([["feito", "Fiz"], ["pulado", "Pulei"], ["sem", "Sem anotação"]] as [Status, string][]).map(([k, t]) => (
                  <button key={k} type="button" aria-pressed={st === k} onClick={() => status(i, k)}>{t}</button>
                ))}
              </div>
            </div>
            {st === "feito" && (
              <div className="gseries">
                {e.series.map((x, k) => (
                  <div className="gs" key={k}>
                    <select className="inp tipo" aria-label={`Tipo da série ${k + 1} de ${e.nome}`} value={x.t}
                      onChange={(ev) => mudarEx(i, (c) => { c.series[k].t = ev.target.value as Serie["t"]; })}>
                      <option value="S">{kindLabel("S", k, e.series) || "Série"}</option><option value="A">Aquec.</option><option value="F">Feeder</option>
                    </select>
                    {e.biset ? (
                      <>
                        <input className="inp" inputMode="numeric" aria-label={`${e.biset[0]} reps, série ${k + 1}`} defaultValue={x.reps} onChange={(ev) => serie(i, k, "reps", ev.target.value)} />
                        <span className="sub">+</span>
                        <input className="inp" inputMode="numeric" aria-label={`${e.biset[1]} reps, série ${k + 1}`} defaultValue={x.reps2 ?? 0} onChange={(ev) => serie(i, k, "reps2", ev.target.value)} />
                        <span className="sub">reps</span>
                      </>
                    ) : (
                      <>
                        <input className="inp" inputMode="decimal" aria-label={`Carga, série ${k + 1} de ${e.nome}`} defaultValue={fmtKg(x.kg)} onChange={(ev) => serie(i, k, "kg", ev.target.value)} />
                        <span className="sub">kg ×</span>
                        <input className="inp" inputMode="numeric" aria-label={`Repetições, série ${k + 1} de ${e.nome}`} defaultValue={x.reps} onChange={(ev) => serie(i, k, "reps", ev.target.value)} />
                      </>
                    )}
                    <button className="btn small ghost" type="button" aria-label={`Apagar série ${k + 1} de ${e.nome}`}
                      onClick={() => mudarEx(i, (c) => { c.series.splice(k, 1); if (!c.series.length) { c.semNota = true; } })}>×</button>
                  </div>
                ))}
                <button className="btn small ghost" type="button" style={{ alignSelf: "flex-start" }}
                  onClick={() => mudarEx(i, (c) => { const u = c.series[c.series.length - 1]; c.series.push(u ? { ...u, t: "S" } : { t: "S", kg: 0, reps: 0, feito: true }); })}>+ série</button>
              </div>
            )}
          </div>
        );
      })}

      <h3 style={{ margin: "6px 0 0" }}>Como foi</h3>
      <ComoFoiCampos item={s.item} valor={comoFoi} mudar={setComoFoi} id={"e" + s.id} />
      <div className="save-row">
        <button className="btn ghost" type="button" onClick={fechar}>Cancelar</button>
        <button className="btn fill" type="button" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar alterações"}</button>
      </div>
    </div>
  );
}
