import { useState } from "react";
import {
  DORES, fmtDateLong, isoToday, ITEMS, ITEM_IDS, uid, type Exercicio, type ItemId, type Nivel, type Rascunho, type Serie, type StatusEx,
} from "../lib/dominio";
import { useStore } from "../lib/storeContext";
import { calcCardio, dorPrincipal, exPendentes, kindLabel, lastFor, montarSessao, rascunhoAtual, seriesFrom, seriesText } from "../lib/treino";

const NIVEIS: [Nivel, string][] = [["ok", "Sem dor"], ["leve", "Incomodou"], ["dor", "Doeu"]];
const SENS: [string, string][] = [["leve", "Leve"], ["ok", "No ponto"], ["pesado", "Pesado"]];

export function OpcoesTreino({ comDescanso = true }: { comDescanso?: boolean }) {
  const grupo = (rotulo: string, ids: ItemId[]) => (
    <optgroup label={rotulo}>{ids.map((k) => <option key={k} value={k}>{ITEMS[k].nome}</option>)}</optgroup>
  );
  return (
    <>
      {grupo("Musculação", ["A", "B", "C", "D"])}
      {grupo("Cardio", ["RQ", "RL", "LG", "BK", "BI"])}
      {comDescanso && grupo("Outro", ["OFF"])}
    </>
  );
}

interface Props {
  itemInicial: ItemId;
  dataFixa: string | null;
  extra: boolean;
  onCancelar?: () => void;
  onSalvo: () => void;
}

export default function Treino({ itemInicial, dataFixa, extra, onCancelar, onSalvo }: Props) {
  const store = useStore();
  const { S } = store;
  const [item, setItem] = useState<ItemId>(ITEM_IDS.includes(itemInicial) ? itemInicial : "A");
  const [rev, setRev] = useState(0); // muda quando a estrutura muda, para os campos recomeçarem
  const [limpar, setLimpar] = useState(false);
  const [revisao, setRevisao] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const it = ITEMS[item];

  const d = rascunhoAtual(S, item);
  if (dataFixa) d.data = dataFixa;
  const gravar = (novo: Rascunho, estrutura = false) => {
    store.salvarRascunho(item, novo);
    if (estrutura) setRev((r) => r + 1);
  };
  const mudar = (fn: (x: Rascunho) => void, estrutura = false) => {
    const novo: Rascunho = JSON.parse(JSON.stringify(d));
    fn(novo);
    gravar(novo, estrutura);
  };

  const salvar = async (rasc: Rascunho) => {
    setSalvando(true);
    const ok = await store.registrarSessao(montarSessao(S, rasc, uid()));
    setSalvando(false);
    if (!ok) return;
    store.descartarRascunho(item);
    store.aviso(it.kind === "forca" ? "Treino salvo" : it.kind === "cardio" ? "Cardio marcado como feito" : "Descanso registrado");
    window.scrollTo(0, 0);
    onSalvo();
  };
  const clicarSalvar = () => {
    if (it.kind === "forca" && exPendentes(S, d).length) { setRevisao(true); return; }
    salvar(d);
  };
  const decidir = (exId: string, st: StatusEx) => {
    const novo: Rascunho = JSON.parse(JSON.stringify(d));
    novo.ex[exId].status = st;
    gravar(novo, true);
    if (!exPendentes(S, novo).length) { setRevisao(false); salvar(novo); }
  };

  const ficha: Exercicio[] = it.kind === "forca" ? S.fichas[item as "A"] : [];
  const concluidos = ficha.filter((e) => {
    const de = d.ex[e.id];
    return de.status === "sug" || (de.status !== "pulado" && de.series.length > 0 && de.series.every((s) => s.feito));
  }).length;
  const pulados = ficha.filter((e) => d.ex[e.id].status === "pulado").length;
  const ehHoje = d.data === isoToday();

  return (
    <>
      <div className="card thead" style={{ "--c": it.c } as React.CSSProperties}>
        <div className="thead-t">
          <span className="lbl">{ehHoje ? (extra ? "Outro treino hoje" : "Treino de hoje") : "Treino de " + fmtDateLong(d.data)}</span>
          <h2 className="big2">{it.nome}</h2>
          {it.det && <span className="sub">{it.det}</span>}
          {it.kind === "forca" && (
            <div className="progress"><b>{concluidos}</b> de {ficha.length} exercícios concluídos{pulados ? ` · ${pulados} ${pulados > 1 ? "pulados" : "pulado"}` : ""}</div>
          )}
        </div>
        <div className="thead-c">
          <div className="field">
            <label htmlFor="sel-item">Trocar treino</label>
            <select id="sel-item" value={item} onChange={(e) => { setItem(e.target.value as ItemId); setRevisao(false); setLimpar(false); }}>
              <OpcoesTreino />
            </select>
          </div>
          <div className="field" style={{ maxWidth: 170 }}>
            <label htmlFor="sel-data">Data</label>
            <input type="date" id="sel-data" value={d.data} disabled={!!dataFixa}
              onChange={(e) => mudar((x) => { x.data = e.target.value || isoToday(); })} />
          </div>
          {limpar ? (
            <span className="inline-confirm" style={{ alignSelf: "flex-end" }}>Apagar o que você marcou neste treino?
              <button className="btn small danger" type="button" onClick={() => {
                store.descartarRascunho(item); setLimpar(false); setRev((r) => r + 1); store.aviso("Marcações apagadas");
              }}>Limpar</button>
              <button className="btn small ghost" type="button" onClick={() => setLimpar(false)}>Cancelar</button>
            </span>
          ) : (
            <button className="btn small ghost" type="button" style={{ alignSelf: "flex-end" }} onClick={() => setLimpar(true)}>Limpar marcações</button>
          )}
          {onCancelar && <button className="btn small ghost" type="button" style={{ alignSelf: "flex-end" }} onClick={onCancelar}>Cancelar</button>}
        </div>
      </div>

      {it.kind === "forca" && (
        <>
          <p className="sub" style={{ margin: "0 0 12px", maxWidth: "80ch" }}>
            As cargas vêm da última vez que você fez cada exercício (ou da ficha, se ainda não houver registro). Ajuste o que
            mudou e marque cada série. Para mudar a ficha em si, use a aba Plano.
          </p>
          <div className="exlist">
            {ficha.map((e, n) => (
              <CartaoExercicio key={e.id + "-" + rev} e={e} n={n} total={ficha.length} d={d} mudar={mudar} />
            ))}
          </div>
        </>
      )}

      {it.kind === "cardio" && (
        <div className="after" style={{ marginTop: 0 }}>
          <div className="card cardio-card" style={{ "--c": it.c } as React.CSSProperties} key={"c" + rev}>
            <h3 style={{ fontSize: 17 }}>Seus números</h3>
            {(item === "BK" || item === "BI") && <p className="sub" style={{ margin: 0 }}>Banco na altura certa: joelho levemente dobrado com o pedal embaixo.</p>}
            <div className="cgrid">
              <div className="field"><label htmlFor="c-dist">Distância (km)</label>
                <input id="c-dist" inputMode="decimal" placeholder={it.mod === "bike" ? "opcional" : "ex.: 10,5"}
                  defaultValue={d.dist == null ? "" : String(d.dist).replace(".", ",")}
                  onChange={(e) => { const v = e.target.value.trim(), n = parseFloat(v.replace(",", ".")); mudar((x) => { x.dist = v && !isNaN(n) ? n : null; }); }} /></div>
              <div className="field"><label htmlFor="c-dur">Tempo (h:mm:ss)</label>
                <input id="c-dur" inputMode="numeric" placeholder="ex.: 1:05:30" defaultValue={d.dur || ""}
                  onChange={(e) => mudar((x) => { x.dur = e.target.value.trim(); })} /></div>
              <div className="field"><label htmlFor="c-fc">FC média (bpm)</label>
                <input id="c-fc" inputMode="numeric" placeholder="opcional" defaultValue={d.fc == null ? "" : d.fc}
                  onChange={(e) => { const v = e.target.value.trim(), n = parseInt(v, 10); mudar((x) => { x.fc = v && !isNaN(n) ? n : null; }); }} /></div>
            </div>
            <div className="calc">
              {calcCardio(it.mod, d)
                ? <>{it.mod === "bike" ? "Velocidade média" : "Pace médio"} <b>{calcCardio(it.mod, d)}</b></>
                : <span className="sub">{it.mod === "bike" ? "Com distância e tempo, mostro a velocidade média." : "Com distância e tempo, calculo o pace."}</span>}
            </div>
            <p className="sub" style={{ margin: 0 }}>Anote o que o relógio mostrou ao terminar. Na Fase 2 esses campos vêm preenchidos pelo Garmin.</p>
          </div>
          <GarminBox kind="cardio" mod={it.mod} />
        </div>
      )}

      {it.kind === "descanso" && (
        <div className="card"><p style={{ margin: 0 }}>Registrar o descanso ajuda o app a entender a semana. Um dia de folga registrado não conta como falta.</p></div>
      )}

      <div className="after">
        <ComoFoi item={item} d={d} mudar={mudar} rev={rev} />
        {it.kind === "forca" && <GarminBox kind="forca" />}
      </div>

      {revisao && it.kind === "forca" && exPendentes(S, d).length > 0 && (
        <div className="card review">
          <b>{exPendentes(S, d).length === 1 ? "Este exercício ficou" : "Estes exercícios ficaram"} sem nenhuma série marcada.</b>
          <span className="sub">O que aconteceu com {exPendentes(S, d).length === 1 ? "ele" : "cada um"}?</span>
          {exPendentes(S, d).map((e) => (
            <div className="rvrow" key={e.id}>
              <span className="rvn">{e.nome}</span>
              <span className="row" style={{ gap: 6 }}>
                <button className="btn small" type="button" onClick={() => decidir(e.id, "sug")}>Fiz como sugerido</button>
                <button className="btn small" type="button" onClick={() => decidir(e.id, "pulado")}>Pulei</button>
                <button className="btn small ghost" type="button" onClick={() => decidir(e.id, "gar")}>
                  {e.manual ? "Não lembro, deixar sem anotar" : "Deixar o Garmin preencher"}
                </button>
              </span>
            </div>
          ))}
          <div className="row"><span className="spacer" /><button className="btn small ghost" type="button" onClick={() => setRevisao(false)}>Voltar ao treino</button></div>
        </div>
      )}

      <div className="save-row">
        <button className="btn fill" type="button" disabled={salvando} onClick={clicarSalvar}>
          {salvando ? "Salvando…" : it.kind === "forca" ? "Salvar treino" : it.kind === "cardio" ? "Marcar como feito" : "Registrar descanso"}
        </button>
      </div>
    </>
  );
}

interface CartaoProps {
  e: Exercicio;
  n: number;
  total: number;
  d: Rascunho;
  mudar: (fn: (x: Rascunho) => void, estrutura?: boolean) => void;
}

function CartaoExercicio({ e, n, total, d, mudar }: CartaoProps) {
  const { S } = useStore();
  const de = d.ex[e.id], vi = de.variante || 0, v = e.variantes[vi], last = lastFor(S, e.id, vi);
  const num = `${String(n + 1).padStart(2, "0")}/${String(total).padStart(2, "0")}`;
  const todas = de.series.length > 0 && de.series.every((s) => s.feito);
  const setSerie = (i: number, campo: keyof Serie, valor: number | boolean) =>
    mudar((x) => { (x.ex[e.id].series[i] as unknown as Record<string, number | boolean>)[campo] = valor; });
  const num_ = (s: string) => { const v2 = parseFloat(String(s).replace(",", ".")); return isNaN(v2) ? 0 : v2; };

  if (de.status === "pulado") {
    return (
      <article className="ex skipped">
        <div className="ex-h"><h3>{e.nome}</h3><span className="ex-n">{num}</span></div>
        <div className="row"><span className="pill next">Pulado neste treino</span><span className="spacer" />
          <button className="btn small ghost" type="button" onClick={() => mudar((x) => { delete x.ex[e.id].status; }, true)}>Desfazer</button></div>
      </article>
    );
  }
  return (
    <article className={"ex" + (todas || de.status === "sug" ? " done" : "")}>
      <div className="ex-h">
        <h3>{e.nome}</h3>
        <span className="row" style={{ gap: 6 }}>
          <button className="btn small ghost" type="button" onClick={() => mudar((x) => { x.ex[e.id].status = "pulado"; }, true)}>Pular</button>
          <span className="ex-n">{num}</span>
        </span>
      </div>
      {e.variantes.length > 1 && (
        <div className="seg" role="group" aria-label="Variação">
          {e.variantes.map((vv, i) => (
            <button key={i} type="button" aria-pressed={i === vi}
              onClick={() => mudar((x) => { x.ex[e.id] = { variante: i, series: seriesFrom(S, e, i) }; }, true)}>{vv.nome || "Opção " + (i + 1)}</button>
          ))}
        </div>
      )}
      <div className="meta">
        {e.ajuste && <div className="adj"><b>Ajuste:</b> {e.ajuste}</div>}
        <div>{last ? `Última (${fmtDateLong(last.data)}): ${seriesText(last.series)}` : `Ficha: ${seriesText(v.series)}`}</div>
        <div>Garmin: {e.manual ? "não usado aqui, você preenche" : e.garmin ? <b>{e.garmin}</b> : "nome ainda não ligado (aba Plano)"}</div>
      </div>
      {v.biset ? (
        <div className="bilist">
          {de.series.map((s, i) => (
            <div key={i} className={"birow" + (s.feito ? " feito" : "")}>
              <div className="bihead"><span className="kind s">{i + 1}ª série</span><span className="sub">bi-set</span><span className="spacer" />
                <label className="bichk"><input type="checkbox" checked={!!s.feito} onChange={(ev) => setSerie(i, "feito", ev.target.checked)} /> Feito</label></div>
              {[0, 1].map((k) => (
                <div className="biex" key={k}>
                  <span className="bin">{v.biset![k]}</span>
                  <label><input type="number" inputMode="numeric" step={1} min={0} aria-label={`${v.biset![k]}: repetições`}
                    defaultValue={k ? s.reps2 : s.reps} onChange={(ev) => setSerie(i, k ? "reps2" : "reps", num_(ev.target.value))} /> reps</label>
                  <label><input type="number" inputMode="decimal" step={0.5} min={0} aria-label={`${v.biset![k]}: carga`} placeholder="0"
                    defaultValue={(k ? s.kg2 : s.kg) || ""} onChange={(ev) => setSerie(i, k ? "kg2" : "kg", num_(ev.target.value))} /> kg</label>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <table className="sets">
          <thead><tr><th>Série</th><th>Carga (kg)</th><th>Reps</th><th>Feito</th></tr></thead>
          <tbody>
            {de.series.map((s, i) => (
              <tr key={i} className={s.feito ? "feito" : ""}>
                <td><span className={"kind" + (s.t === "S" ? " s" : "")}>{kindLabel(s.t, i, de.series)}</span></td>
                <td><input type="number" inputMode="decimal" step={0.5} min={0} aria-label={`Carga ${i + 1}`} defaultValue={s.kg}
                  onChange={(ev) => setSerie(i, "kg", num_(ev.target.value))} /></td>
                <td><input type="number" inputMode="numeric" step={1} min={0} aria-label={`Repetições ${i + 1}`} defaultValue={s.reps}
                  onChange={(ev) => setSerie(i, "reps", num_(ev.target.value))} /></td>
                <td><input type="checkbox" aria-label={`Série ${i + 1} feita`} checked={!!s.feito} onChange={(ev) => setSerie(i, "feito", ev.target.checked)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row">
        <button className="btn small ghost" type="button" onClick={() => mudar((x) => {
          const arr = x.ex[e.id].series, l = arr[arr.length - 1];
          const ns: Serie = { t: "S", kg: l ? l.kg : 0, reps: l ? l.reps : 10, feito: false };
          if (l && l.reps2 != null) { ns.kg2 = l.kg2 || 0; ns.reps2 = l.reps2; }
          arr.push(ns);
        }, true)}>+ série</button>
        {de.series.length > 1 && (
          <button className="btn small ghost" type="button" onClick={() => mudar((x) => { x.ex[e.id].series.pop(); }, true)}>− série</button>
        )}
      </div>
    </article>
  );
}

function ComoFoi({ item, d, mudar, rev }: { item: ItemId; d: Rascunho; mudar: CartaoProps["mudar"]; rev: number }) {
  const it = ITEMS[item], principal = dorPrincipal(item);
  const ciclo = (k: string) => mudar((x) => { const v = x.dores[k]; x.dores[k] = v === "leve" ? "dor" : v === "dor" ? "" : "leve"; });
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h3 style={{ fontSize: 19 }}>Como foi</h3>
      {principal && (
        <div className="field"><span className="lbl">{DORES[principal]}</span>
          <div className="seg" role="group" aria-label={DORES[principal]}>
            {NIVEIS.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={d.dores[principal] === v}
                onClick={() => mudar((x) => { x.dores[principal] = x.dores[principal] === v ? "" : v; })}>{l}</button>
            ))}
          </div>
        </div>
      )}
      <div className="field">
        <span className="lbl">Outras dores <span style={{ color: "var(--faint)" }}>(toque uma vez para "incomodou", duas para "doeu")</span></span>
        <div className="dchips">
          {Object.keys(DORES).filter((k) => k !== principal).map((k) => {
            const v = d.dores[k];
            return (
              <button key={k} type="button" className={"dchip " + (v === "leve" || v === "dor" ? v : "")} aria-pressed={v === "leve" || v === "dor"} onClick={() => ciclo(k)}>
                {DORES[k]}{v === "leve" ? " · incomodou" : v === "dor" ? " · doeu" : ""}
              </button>
            );
          })}
        </div>
      </div>
      {it.kind === "cardio" && (
        <div className="field"><span className="lbl">Sensação</span>
          <div className="seg" role="group" aria-label="Sensação">
            {SENS.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={d.sensacao === v} onClick={() => mudar((x) => { x.sensacao = x.sensacao === v ? "" : v; })}>{l}</button>
            ))}
          </div>
        </div>
      )}
      <div className="field"><label htmlFor="notas">Notas</label>
        <textarea id="notas" key={"n" + rev} rows={2} placeholder="Algo que valha lembrar na próxima vez" defaultValue={d.notas}
          onChange={(e) => mudar((x) => { x.notas = e.target.value; })} /></div>
    </div>
  );
}

function GarminBox({ kind, mod }: { kind: "forca" | "cardio"; mod?: string }) {
  const linhas = kind === "forca"
    ? ["Duração total", "FC média / máx.", "Séries registradas pelo relógio", "Descanso médio", "Calorias"]
    : ["Distância", "Tempo", mod === "bike" ? "Velocidade / potência" : "Pace médio", "FC média", mod === "bike" ? "Cadência (rpm)" : "Cadência (ppm)", "Efeito do treino"];
  return (
    <div className="card garmin">
      <h3>O que o Garmin registrou</h3>
      <p className="sub" style={{ margin: 0 }}>
        Chega na Fase 2, quando a sincronização com o relógio estiver ligada
        {kind === "forca" ? ". O que você anotou continua valendo; o Garmin só completa o que ficar sem anotação, e você confirma." : "."}
      </p>
      <dl>{linhas.map((l) => <div key={l} style={{ display: "contents" }}><dt>{l}</dt><dd>—</dd></div>)}</dl>
    </div>
  );
}
