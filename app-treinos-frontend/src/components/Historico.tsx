import { useState } from "react";
import {
  addDays, dateOf, ddmm, dow, DIAS_C, DORES, emMetros, fmtDateLong, fmtDist, fmtDur, fmtInt, fmtKg, fmtKm, fmtPace, fmtRitmo, isoOf, isoToday, ITEMS, MESES,
  MODALIDADES, mondayOf, SENSACAO, type FichaId, type Modalidade, type Sessao,
} from "../lib/dominio";
import { weekInfo } from "../lib/semana";
import { useStore } from "../lib/storeContext";
import { cardioLine, doresAtivas, doresTexto, exValido, seriesText, sessoesDesc, temDor, volume } from "../lib/treino";
import { GraficoBarras, GraficoLinha, type Ponto } from "./Graficos";
import { DetalheTreino } from "./Insights";
import { AnaliseIA } from "./IA";
import SonoHist from "./Sono";
import { marcasDo } from "../lib/insights";
import { Halter, Pulso } from "./Icones";

type Sub = "resumo" | "mes" | "musculacao" | "cardio" | "treinos" | "sono";
const SUBS: [Sub, string][] = [["resumo", "Semana"], ["mes", "Mês"], ["musculacao", "Musculação"], ["cardio", "Cardio"], ["sono", "Sono"], ["treinos", "Treinos"]];

/** Vermelho se algo doeu, amarelo se só incomodou. */
function corDor(s: Sessao): React.CSSProperties | undefined {
  const a = doresAtivas(s);
  if (!a.length) return undefined;
  return { color: a.some(([, v]) => v === "dor") ? "var(--bad)" : "var(--warn)" };
}

export default function Historico() {
  const [sub, setSub] = useState<Sub>("resumo");
  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <div className="seg" role="group" aria-label="Visão">
          {SUBS.map(([k, n]) => <button key={k} type="button" aria-pressed={k === sub} onClick={() => setSub(k)}>{n}</button>)}
        </div>
      </div>
      {sub === "resumo" && <Resumo />}
      {sub === "mes" && <Mes />}
      {sub === "musculacao" && <Musculacao />}
      {sub === "cardio" && <CardioHist />}
      {sub === "sono" && <SonoHist />}
      {sub === "treinos" && <Lista />}
    </>
  );
}

const Delta = ({ p, sufixo }: { p: number | null; sufixo: string }) =>
  p === null ? null : <span className={"delta " + (p > 0 ? "up" : p < 0 ? "down" : "")}>{p > 0 ? "+" : ""}{p}% {sufixo}</span>;

function Li({ sinal, nome, v }: { sinal: "+" | "−"; nome: string; v: string | number }) {
  return (
    <div className="li"><span><b style={{ color: sinal === "+" ? "var(--ok)" : "var(--bad)" }}>{sinal}</b> {nome}</span>
      <b style={sinal === "−" && v ? { color: "var(--bad)" } : undefined}>{v}</b></div>
  );
}

function Resumo() {
  const { S } = useStore();
  const w = weekInfo(S);
  const feitos = w.byDay.filter((a) => a.some((s) => s.item !== "OFF")).length;
  const faltas = w.byDay.slice(0, w.ti).filter((a, i) => !a.length && !w.pre[i]).length;
  const sess = w.byDay.flat();
  const joelho = sess.filter((s) => temDor(s, "joelho")).length, cotovelo = sess.filter((s) => temDor(s, "cotovelo")).length;
  const outras = sess.filter((s) => doresAtivas(s).some(([k]) => k !== "joelho" && k !== "cotovelo")).length;
  const vol = sess.filter((s) => s.kind === "forca").reduce((a, s) => a + volume(s), 0);
  const ant = addDays(w.dates[0], -7), corte = addDays(ant, w.ti);
  const volAnt = S.sessoes.filter((s) => s.kind === "forca" && s.data >= ant && s.data <= corte).reduce((a, s) => a + volume(s), 0);
  const dv = volAnt > 0 ? Math.round(((vol - volAnt) / volAnt) * 100) : null;
  const cardioPlan = S.padrao.filter((x) => ITEMS[x].kind === "cardio").length, cardio = sess.filter((s) => s.kind === "cardio");
  const km = cardio.filter((s) => ITEMS[s.item].mod === "corrida").reduce((a, s) => a + (s.cardio?.dist || 0), 0);
  const forca = sess.filter((s) => s.kind === "forca").length;
  return (
    <>
    <div className="hero">
      <div className="card hero-main">
        <div className="hero-today">
          <span className="k">Semana de {ddmm(w.dates[0])} a {ddmm(w.dates[6])}</span>
          <span className="big">{feitos}<small style={{ fontSize: ".4em", opacity: 0.6, marginLeft: 6 }}>de 7 dias</small></span>
          <span className="det">treinados até agora</span>
        </div>
        <div className="hero-list">
          <Li sinal="+" nome="Musculação" v={forca} />
          <Li sinal="+" nome="Cardio" v={`${cardio.length} de ${cardioPlan}`} />
          <Li sinal="−" nome="Faltas" v={faltas} />
          <Li sinal="−" nome="Joelho (incomodou ou doeu)" v={joelho} />
          <Li sinal="−" nome="Cotovelo (incomodou ou doeu)" v={cotovelo} />
          {outras > 0 && <Li sinal="−" nome="Outras dores" v={outras} />}
        </div>
      </div>
      <div className="hero-side">
        <div className="card mini">
          <div className="k"><span className="ic"><Halter tam={14} /></span>Volume da semana</div>
          <div className="v">{fmtInt(vol)}<small>kg</small></div>
          <div className="s">{dv !== null ? <Delta p={dv} sufixo="vs mesmo ponto da semana passada" /> : "Sem semana anterior para comparar"}</div>
        </div>
        <div className="card mini">
          <div className="k"><span className="ic"><Pulso /></span>Corrida na semana</div>
          <div className="v">{fmtKm(km)}<small>km</small></div>
          <div className="s">Soma das distâncias anotadas</div>
        </div>
      </div>
    </div>
    <AnaliseIA tipo="semana" chave={w.dates[0]} titulo="Esta semana"
      auto={dow(isoToday()) === 6 && new Date().getHours() >= 18}
      vazio="No domingo à noite a revisão sai sozinha. Antes disso, toque em Gerar análise para ver como a semana está indo (Sonnet 5.5, ~US$ 0,07)." />
    {addDays(w.dates[0], -7) >= S.inicio && S.sessoes.some((s) => s.data >= addDays(w.dates[0], -7) && s.data < w.dates[0]) && (
      <AnaliseIA tipo="semana" chave={addDays(w.dates[0], -7)} titulo="Semana passada" auto />
    )}
    </>
  );
}

function Mes() {
  const { S } = useStore();
  const hoje = isoToday();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [y, m] = mes.split("-").map(Number);
  const dias = new Date(y, m, 0).getDate();
  const doMes = S.sessoes.filter((s) => s.data.startsWith(mes));
  const reais = doMes.filter((s) => s.item !== "OFF");
  const forca = reais.filter((s) => s.kind === "forca"), cardio = reais.filter((s) => s.kind === "cardio");
  const iso = (d: number) => `${mes}-${String(d).padStart(2, "0")}`;
  let semTreino = 0;
  for (let d = 1; d <= dias; d++) if (iso(d) < hoje && iso(d) >= S.inicio && !doMes.some((s) => s.data === iso(d))) semTreino++;
  const contDor: Record<string, { leve: number; dor: number }> = {};
  doMes.forEach((s) => doresAtivas(s).forEach(([k, v]) => { contDor[k] = contDor[k] || { leve: 0, dor: 0 }; contDor[k][v as "leve" | "dor"]++; }));
  const comDor = doMes.filter((s) => doresAtivas(s).some(([, v]) => v === "dor")).length;
  const soIncomodou = doMes.filter((s) => doresAtivas(s).length && !doresAtivas(s).some(([, v]) => v === "dor")).length;
  const pm = isoOf(new Date(y, m - 2, 1)).slice(0, 7), nm = isoOf(new Date(y, m, 1)).slice(0, 7);
  const atual = mes === hoje.slice(0, 7), corte = hoje.slice(8, 10);
  const vol = forca.reduce((a, s) => a + volume(s), 0);
  const volAnt = S.sessoes.filter((s) => s.data.startsWith(pm) && s.kind === "forca" && (!atual || s.data.slice(8, 10) <= corte)).reduce((a, s) => a + volume(s), 0);
  const dv = volAnt > 0 ? Math.round(((vol - volAnt) / volAnt) * 100) : null;
  const lead = (dateOf(iso(1)).getDay() + 6) % 7;
  const mon = mondayOf(hoje);
  const semanas: Ponto[] = [];
  for (let k = 11; k >= 0; k--) {
    const ws = addDays(mon, -7 * k), we = addDays(ws, 6), ss = S.sessoes.filter((s) => s.data >= ws && s.data <= we);
    const v = ss.filter((s) => s.kind === "forca").reduce((a, s) => a + volume(s), 0);
    semanas.push({ label: ddmm(ws), y: v, tip: `Semana de ${ddmm(ws)}\nVolume: ${fmtInt(v)} kg\nMusculação: ${ss.filter((s) => s.kind === "forca").length} · Cardio: ${ss.filter((s) => s.kind === "cardio").length}` });
  }
  const legenda: [keyof typeof ITEMS, string][] = [["A", ITEMS.A.nome], ["B", ITEMS.B.nome], ["C", ITEMS.C.nome], ["D", ITEMS.D.nome], ["RQ", "Corrida"], ["BK", "Bike"], ["NT", "Natação"]];
  return (
    <>
      <div className="row">
        <button className="btn small" type="button" aria-label="Mês anterior" onClick={() => setMes(pm)}>‹</button>
        <h2 style={{ minWidth: 200, textAlign: "center" }}>{MESES[m - 1]} {y}</h2>
        <button className="btn small" type="button" aria-label="Próximo mês" disabled={nm > hoje.slice(0, 7)} onClick={() => setMes(nm)}>›</button>
      </div>
      <div className="tiles">
        <div className="tile"><div className="v">{reais.length}</div><div className="l">treinos no mês</div></div>
        <div className="tile"><div className="v">{forca.length}</div><div className="l">de musculação</div></div>
        <div className="tile"><div className="v">{cardio.length}</div><div className="l">de cardio</div></div>
        <div className="tile"><div className="v">{semTreino}</div><div className="l">dias sem treino</div></div>
        <div className="tile"><div className="v">{fmtInt(vol)}</div><div className="l">kg de volume{dv !== null && <> · <Delta p={dv} sufixo={atual ? "vs mesmo período do mês anterior" : "vs mês anterior"} /></>}</div></div>
        <div className="tile"><div className="v" style={comDor ? { color: "var(--bad)" } : undefined}>{comDor}</div><div className="l">treinos com dor{soIncomodou > 0 && <> · <span style={{ color: "var(--warn)" }}>{soIncomodou} só incomodou</span></>}</div></div>
      </div>
      {Object.keys(contDor).length > 0 && (
        <div className="dorlist">
          {Object.entries(contDor).sort((a, b) => b[1].leve + b[1].dor - (a[1].leve + a[1].dor)).map(([k, c]) => (
            <span key={k} className={"chip " + (c.dor ? "bad" : "warn")}>
              {DORES[k] || k}: {[c.dor && `doeu ${c.dor}×`, c.leve && `incomodou ${c.leve}×`].filter(Boolean).join(", ")}
            </span>
          ))}
        </div>
      )}
      <div className="legend">{legenda.map(([k, n]) => <span key={k} style={{ "--c": ITEMS[k].c } as React.CSSProperties}><i className="dot" />{n}</span>)}</div>
      <div className="cal">
        {DIAS_C.map((d) => <div key={d} className="wd">{d}</div>)}
        {[...Array(lead)].map((_, i) => <div key={"o" + i} className="cell out" aria-hidden="true" />)}
        {[...Array(dias)].map((_, k) => {
          const dIso = iso(k + 1), ss = doMes.filter((s) => s.data === dIso), falta = !ss.length && dIso < hoje && dIso >= S.inicio;
          const nomes = (nivel: string) => [...new Set(ss.flatMap((s) => doresAtivas(s).filter(([, v]) => v === nivel).map(([x]) => (DORES[x] || x).split("/")[0].toLowerCase())))];
          const doeu = nomes("dor"), incomodou = nomes("leve").filter((x) => !doeu.includes(x));
          return (
            <div key={dIso} className={"cell" + (falta ? " miss" : "") + (dIso === hoje ? " today" : "")}>
              <span className="n">{k + 1}</span>
              {ss.map((s) => <span key={s.id} className="s" style={{ "--c": ITEMS[s.item].c } as React.CSSProperties}><i className="dot" /><span>{ITEMS[s.item].curto}</span></span>)}
              {doeu.length > 0 && <span className="k">doeu: {doeu.join(", ")}</span>}
              {incomodou.length > 0 && <span className="k leve">incomodou: {incomodou.join(", ")}</span>}
              {falta && <span className="x">sem treino</span>}
            </div>
          );
        })}
      </div>
      <div className="chart">
        <h3>Volume de musculação por semana</h3>
        <div className="cap">Últimas 12 semanas. Carga × repetições das séries válidas.</div>
        {semanas.some((s) => s.y > 0) ? <GraficoBarras pts={semanas} /> : <div className="empty">Salve treinos de musculação para ver o volume semanal.</div>}
      </div>
    </>
  );
}

function Musculacao() {
  const { S } = useStore();
  const todos = (["A", "B", "C", "D"] as FichaId[]).flatMap((k) => S.fichas[k].map((e) => ({ k, e })));
  const [exId, setExId] = useState(todos[0]?.e.id || "");
  const [vi, setVi] = useState(0);
  const achado = todos.find((x) => x.e.id === exId);
  const vars = achado ? achado.e.variantes : [];
  const varSel = vi < vars.length ? vi : 0;
  const hist = S.sessoes.slice().sort((a, b) => a.data.localeCompare(b.data) || a.ts - b.ts).flatMap((s) =>
    (s.exercicios || []).filter((e) => e.id === exId && exValido(e) && (vars.length < 2 || (e.variante || 0) === varSel)).flatMap((e) => {
      const val = e.series.filter((x) => x.t === "S");
      if (!val.length) return [];
      const top = Math.max(...val.map((x) => x.kg || 0));
      return [{
        data: s.data, top, vol: val.reduce((a, x) => a + (x.kg || 0) * (x.reps || 0) + (x.kg2 || 0) * (x.reps2 || 0), 0),
        reps: val.reduce((a, x) => a + (x.reps || 0) + (x.reps2 || 0), 0),
        repsTop: val.filter((x) => x.kg === top).reduce((a, x) => Math.max(a, x.reps || 0), 0), txt: seriesText(e.series),
      }];
    }));
  const seletor = (
    <div className="row" style={{ alignItems: "flex-end" }}>
      <div className="field" style={{ minWidth: 260 }}>
        <label htmlFor="hist-ex">Exercício</label>
        <select id="hist-ex" value={exId} onChange={(e) => { setExId(e.target.value); setVi(0); }}>
          {(["A", "B", "C", "D"] as FichaId[]).map((k) => (
            <optgroup key={k} label={ITEMS[k].nome}>{S.fichas[k].map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</optgroup>
          ))}
        </select>
      </div>
      {vars.length > 1 && (
        <div className="seg" role="group" aria-label="Variação">
          {vars.map((v, i) => <button key={i} type="button" aria-pressed={i === varSel} onClick={() => setVi(i)}>{v.nome || "Opção " + (i + 1)}</button>)}
        </div>
      )}
    </div>
  );
  const geral = <AnaliseIA tipo="musculacao" chave={isoToday()} titulo="Musculação nas últimas 8 semanas"
    vazio="Toque em Gerar análise: progressão, cargas paradas e prioridades por exercício (Sonnet 5.5, ~US$ 0,05)." />;
  if (!hist.length) return <>{geral}{seletor}<div className="empty" style={{ marginTop: 12 }}>Ainda não há registros deste exercício. Eles aparecem aqui depois do primeiro treino salvo.</div></>;
  const melhor = Math.max(...hist.map((h) => h.top)), ult = hist[hist.length - 1], pri = hist[0];
  const tabela = (repsModo: boolean) => (
    <div className="chart"><h3>Registros</h3><div className="tbl-wrap"><table className="data">
      <thead><tr><th>Data</th><th>Séries</th><th>{repsModo ? "Repetições" : "Volume"}</th></tr></thead>
      <tbody>{hist.slice().reverse().slice(0, 15).map((h, i) => (
        <tr key={i}><td>{fmtDateLong(h.data)}</td><td className="mono">{h.txt}</td><td className="mono">{repsModo ? h.reps : fmtInt(h.vol) + " kg"}</td></tr>
      ))}</tbody>
    </table></div></div>
  );
  if (melhor === 0) {
    // sem carga (peso corporal ou bi-set livre): acompanha repetições
    const rp = hist.map((h) => ({ label: ddmm(h.data), y: h.reps, tip: `${fmtDateLong(h.data)}\nRepetições: ${h.reps}` }));
    return (
      <>
        {geral}
        {seletor}
        <div className="tiles">
          <div className="tile"><div className="v">{ult.reps}</div><div className="l">repetições no último treino</div></div>
          <div className="tile"><div className="v">{Math.max(...hist.map((h) => h.reps))}</div><div className="l">recorde de repetições num treino</div></div>
          <div className="tile"><div className="v">{ult.reps - pri.reps > 0 ? "+" : ""}{ult.reps - pri.reps}</div><div className="l">desde o primeiro registro</div></div>
          <div className="tile"><div className="v">{hist.length}</div><div className="l">treinos registrados</div></div>
        </div>
        <div className="chart"><h3>Repetições por treino</h3><div className="cap">Soma das séries válidas{vars[varSel]?.biset ? ", contando os dois exercícios do bi-set" : ""}.</div><GraficoBarras pts={rp} /></div>
        {tabela(true)}
      </>
    );
  }
  const dk = ult.top - pri.top;
  const rms = marcasDo(S, exId, varSel).filter((m) => m.rm > 0);
  const rmUlt = rms.length ? rms[rms.length - 1].rm : 0, rmMax = Math.max(0, ...rms.map((m) => m.rm));
  return (
    <>
      {geral}
      {seletor}
      <div className="tiles">
        <div className="tile"><div className="v">{fmtKg(melhor)} kg</div><div className="l">maior carga registrada</div></div>
        <div className="tile"><div className="v">{fmtKg(ult.top)} kg × {ult.repsTop}</div><div className="l">série mais pesada da última vez</div></div>
        <div className="tile"><div className="v">{dk > 0 ? "+" : ""}{fmtKg(dk)} kg</div><div className="l">desde o primeiro registro</div></div>
        <div className="tile"><div className="v">{fmtKg(Math.round(rmUlt))} kg</div><div className="l">1RM estimado agora (máx. {fmtKg(Math.round(rmMax))} kg)</div></div>
        <div className="tile"><div className="v">{hist.length}</div><div className="l">treinos registrados</div></div>
      </div>
      <div className="charts2">
        <div className="chart"><h3>Carga da série mais pesada</h3><div className="cap">Em kg, por treino. Feeders e aquecimento ficam de fora.</div>
          <GraficoLinha pts={hist.map((h) => ({ label: ddmm(h.data), y: h.top, tip: `${fmtDateLong(h.data)}\nSérie mais pesada: ${fmtKg(h.top)} kg × ${h.repsTop}` }))} unidade="kg" /></div>
        <div className="chart"><h3>Volume do exercício</h3><div className="cap">Carga × repetições das séries válidas, em kg.</div>
          <GraficoBarras pts={hist.map((h) => ({ label: ddmm(h.data), y: h.vol, tip: `${fmtDateLong(h.data)}\nVolume: ${fmtInt(h.vol)} kg` }))} /></div>
      </div>
      {tabela(false)}
    </>
  );
}

type Periodo = "treino" | "semana" | "mes" | "ano";
const PERIODOS: [Periodo, string][] = [["treino", "Por treino"], ["semana", "Semana"], ["mes", "Mês"], ["ano", "Ano"]];
const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Distância agrupada: cada treino, as últimas 12 semanas, os últimos 12 meses ou todos os anos. */
function pontosDistancia(todas: Sessao[], periodo: Periodo, mod: Modalidade): Ponto[] {
  const m = emMetros(mod), val = (km: number) => (m ? Math.round(km * 1000) : km);
  const un = (km: number) => fmtDist(km, mod);
  const soma = (ss: Sessao[]) => ss.reduce((a, s) => a + (s.cardio?.dist || 0), 0);
  const hoje = isoToday();
  if (periodo === "treino") {
    return todas.filter((s) => s.cardio?.dist).slice(-40).map((s) => ({
      label: ddmm(s.data), y: val(s.cardio!.dist!), tip: `${fmtDateLong(s.data)} · ${ITEMS[s.item].nome}\n${un(s.cardio!.dist!)}${s.cardio!.dur_s ? " em " + fmtDur(s.cardio!.dur_s) : ""}`,
    }));
  }
  if (periodo === "semana") {
    const mon = mondayOf(hoje), out: Ponto[] = [];
    for (let k = 11; k >= 0; k--) {
      const ws = addDays(mon, -7 * k), we = addDays(ws, 6), ss = todas.filter((s) => s.data >= ws && s.data <= we), d = soma(ss);
      out.push({ label: ddmm(ws), y: val(d), tip: `Semana de ${ddmm(ws)}\n${un(d)} · ${ss.length} ${ss.length === 1 ? "treino" : "treinos"}` });
    }
    return out;
  }
  if (periodo === "mes") {
    const [y, mm] = hoje.split("-").map(Number), out: Ponto[] = [];
    for (let k = 11; k >= 0; k--) {
      const dt = new Date(y, mm - 1 - k, 1), chave = isoOf(dt).slice(0, 7), ss = todas.filter((s) => s.data.startsWith(chave)), d = soma(ss);
      out.push({ label: `${MES_CURTO[dt.getMonth()]}/${String(dt.getFullYear()).slice(2)}`, y: val(d), tip: `${MESES[dt.getMonth()]} de ${dt.getFullYear()}\n${un(d)} · ${ss.length} ${ss.length === 1 ? "treino" : "treinos"}` });
    }
    return out;
  }
  const anos = [...new Set(todas.map((s) => s.data.slice(0, 4)))].sort();
  if (!anos.includes(hoje.slice(0, 4))) anos.push(hoje.slice(0, 4));
  return anos.map((a) => {
    const ss = todas.filter((s) => s.data.startsWith(a)), d = soma(ss);
    return { label: a, y: val(d), tip: `${a}\n${un(d)} · ${ss.length} ${ss.length === 1 ? "treino" : "treinos"}` };
  });
}

function CardioHist() {
  const { S } = useStore();
  const [mod, setMod] = useState<Modalidade>("corrida");
  const [periodo, setPeriodo] = useState<Periodo>("semana");
  const m = emMetros(mod), comPace = mod === "corrida" || mod === "natacao";
  const todas = S.sessoes.filter((s) => s.kind === "cardio" && ITEMS[s.item].mod === mod).sort((a, b) => a.data.localeCompare(b.data) || a.ts - b.ts);
  const seg = (
    <div className="row" style={{ marginBottom: 4 }}>
      <div className="seg" role="group" aria-label="Modalidade">
        {MODALIDADES.map(({ id, nome }) => <button key={id} type="button" aria-pressed={id === mod} onClick={() => setMod(id)}>{nome}</button>)}
      </div>
    </div>
  );
  if (!todas.length) return <>{seg}<div className="empty" style={{ marginTop: 12 }}>Nada registrado ainda. Ao marcar o cardio como feito na aba Hoje, anote distância, tempo e FC; eles aparecem aqui.</div></>;
  const hoje = isoToday(), mesAtual = hoje.slice(0, 7), anoAtual = hoje.slice(0, 4);
  const doMes = todas.filter((s) => s.data.startsWith(mesAtual)), doAno = todas.filter((s) => s.data.startsWith(anoAtual));
  const soma = (arr: Sessao[], f: "dist" | "dur_s") => arr.reduce((a, s) => a + (s.cardio?.[f] || 0), 0);
  const ritmo = doMes.filter((s) => s.cardio?.dist && s.cardio?.dur_s);
  const dM = ritmo.reduce((a, s) => a + s.cardio!.dist!, 0), tM = ritmo.reduce((a, s) => a + s.cardio!.dur_s!, 0);
  const maior = Math.max(0, ...todas.map((s) => s.cardio?.dist || 0));
  const dist = pontosDistancia(todas, periodo, mod);
  const fmtEixo = (n: number) => (m ? fmtInt(n) : fmtKm(n));
  const linha: Ponto[] = comPace
    ? todas.filter((s) => s.cardio?.dist && s.cardio?.dur_s).map((s) => {
      const seg = m ? s.cardio!.dur_s! / (s.cardio!.dist! * 10) : s.cardio!.dur_s! / s.cardio!.dist!;
      return { label: ddmm(s.data), y: seg, tip: `${fmtDateLong(s.data)} · ${ITEMS[s.item].nome}\n${fmtDist(s.cardio!.dist!, mod)} em ${fmtDur(s.cardio!.dur_s)}\n${fmtRitmo(s.cardio!.dist!, s.cardio!.dur_s!, mod)}` };
    })
    : todas.filter((s) => s.cardio?.dist && s.cardio?.dur_s).map((s) => ({
      label: ddmm(s.data), y: s.cardio!.dist! / (s.cardio!.dur_s! / 3600),
      tip: `${fmtDateLong(s.data)} · ${ITEMS[s.item].nome}\n${fmtDist(s.cardio!.dist!, mod)} em ${fmtDur(s.cardio!.dur_s)}\n${fmtRitmo(s.cardio!.dist!, s.cardio!.dur_s!, mod)}`,
    }));
  const unidade = { fontSize: ".45em", opacity: 0.6, marginLeft: 4 };
  const big = (km: number) => (m ? <>{fmtInt(km * 1000)}<small style={unidade}>m</small></> : <>{fmtKm(km)}<small style={unidade}>km</small></>);
  return (
    <>
      {seg}
      <AnaliseIA tipo="cardio" chave={isoToday()} titulo="Cardio nas últimas 12 semanas"
        vazio="Toque em Gerar análise: volume, ritmo, eficiência, longão, joelho e sono (Sonnet 5.5, ~US$ 0,05)." />
      <div className="tiles">
        <div className="tile"><div className="v">{doMes.length}</div><div className="l">treinos neste mês</div></div>
        <div className="tile"><div className="v">{big(soma(doMes, "dist"))}</div><div className="l">no mês</div></div>
        <div className="tile"><div className="v">{big(soma(doAno, "dist"))}</div><div className="l">em {anoAtual}</div></div>
        <div className="tile"><div className="v">{fmtDur(soma(doMes, "dur_s"))}</div><div className="l">de tempo no mês</div></div>
        <div className="tile"><div className="v" style={{ fontSize: 24 }}>{dM && tM ? fmtRitmo(dM, tM, mod) : "—"}</div><div className="l">{comPace ? "pace médio do mês" : "velocidade média do mês"}</div></div>
        <div className="tile"><div className="v">{big(maior)}</div><div className="l">maior distância num treino</div></div>
      </div>
      <div className="chart">
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div><h3>Distância</h3><div className="cap">{periodo === "treino" ? "Cada treino (últimos 40)." : periodo === "semana" ? "Soma por semana, últimas 12." : periodo === "mes" ? "Soma por mês, últimos 12." : "Soma por ano."} Em {m ? "metros" : "km"}.</div></div>
          <span className="spacer" />
          <div className="seg" role="group" aria-label="Agrupar distância por">
            {PERIODOS.map(([k, n]) => <button key={k} type="button" aria-pressed={k === periodo} onClick={() => setPeriodo(k)}>{n}</button>)}
          </div>
        </div>
        {dist.some((p) => p.y > 0)
          ? (periodo === "treino" && dist.length > 1 ? <GraficoLinha pts={dist} unidade={m ? "m" : "km"} fmt={fmtEixo} /> : <GraficoBarras pts={dist} fmt={fmtEixo} />)
          : <div className="empty">Anote a distância dos treinos para ver esse gráfico.{mod === "bike" ? " Na bike indoor, use a do painel da bike." : ""}</div>}
      </div>
      <div className="chart">
        <h3>{comPace ? (m ? "Pace por 100 m" : "Pace por corrida") : "Velocidade média por treino"}</h3>
        <div className="cap">{comPace ? "Minutos; quanto mais baixo, mais rápido." : "Em km/h."}</div>
        {linha.length ? <GraficoLinha pts={linha} unidade={comPace ? (m ? "/100 m" : "/km") : "km/h"} fmt={comPace ? fmtPace : fmtKm} />
          : <div className="empty">Anote distância e tempo para ver esse gráfico.</div>}
      </div>
      <div className="chart"><h3>Registros</h3><div className="tbl-wrap"><table className="data">
        <thead><tr><th>Data</th><th>Treino</th><th>Distância</th><th>Tempo</th><th>{comPace ? "Pace" : "Velocidade"}</th><th>FC</th><th>Sensação</th><th>Dores</th><th>Notas</th></tr></thead>
        <tbody>{todas.slice().reverse().slice(0, 30).map((s) => {
          const c = s.cardio || { dist: null, dur_s: null, fc: null };
          return (
            <tr key={s.id}>
              <td>{fmtDateLong(s.data)}</td><td>{ITEMS[s.item].nome}</td>
              <td className="mono">{c.dist ? fmtDist(c.dist, mod) : "—"}</td><td className="mono">{fmtDur(c.dur_s)}</td>
              <td className="mono">{c.dist && c.dur_s ? fmtRitmo(c.dist, c.dur_s, mod) : "—"}</td>
              <td className="mono">{c.fc ? c.fc + " bpm" : "—"}</td><td>{s.sensacao ? SENSACAO[s.sensacao] : "—"}</td>
              <td style={corDor(s)}>{doresTexto(s, true) || "—"}</td><td className="mono">{s.notas}</td>
            </tr>
          );
        })}</tbody>
      </table></div></div>
    </>
  );
}

function Lista() {
  const store = useStore();
  const { S } = store;
  const [filtro, setFiltro] = useState("todos");
  const [apagar, setApagar] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const filtros: [string, string][] = [["todos", "Todos"], ["A", "Peito"], ["B", "Costas"], ["C", "Ombro"], ["D", "Perna"], ["cardio", "Cardio"]];
  const desc = sessoesDesc(S);
  const lista = desc.filter((s) => filtro === "todos" || (filtro === "cardio" ? s.kind === "cardio" : s.item === filtro));
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        {filtros.map(([k, n]) => <button key={k} type="button" className={"btn small" + (k === filtro ? " primary" : "")} onClick={() => setFiltro(k)}>{n}</button>)}
      </div>
      {!lista.length ? <div className="empty">Nenhum registro ainda. Faça o treino na aba Hoje e salve no fim.</div> : (
        <div className="hist">
          {lista.map((s) => {
            const it = ITEMS[s.item] || ITEMS.OFF, v = volume(s);
            const ant = desc.find((x) => x.item === s.item && x.kind === "forca" && (x.data < s.data || (x.data === s.data && x.ts < s.ts)));
            const pv = ant ? volume(ant) : 0, p = s.kind === "forca" && pv > 0 ? Math.round(((v - pv) / pv) * 100) : null;
            const dores = doresTexto(s, true);
            return (
              <article key={s.id} className="sess" style={{ "--c": it.c } as React.CSSProperties}>
                <div className="sess-h">
                  <h3>{it.nome}</h3><span className="date">{fmtDateLong(s.data)}</span>
                  {s.kind === "forca" && <><span className="vol">Volume {fmtInt(v)} kg</span><Delta p={p} sufixo="vs anterior" /></>}
                  {s.kind === "cardio" && cardioLine(s) && <span className="vol">{cardioLine(s)}</span>}
                  {dores && <span className="sub" style={corDor(s)}>{dores}</span>}
                  {s.sensacao && <span className="sub">Sensação: {SENSACAO[s.sensacao]}</span>}
                  <span className="spacer" />
                  <button className={"btn small" + (aberto === s.id ? " primary" : "")} type="button" aria-expanded={aberto === s.id}
                    onClick={() => setAberto(aberto === s.id ? null : s.id)}>{aberto === s.id ? "Fechar" : "Abrir treino"}</button>
                  {apagar === s.id ? (
                    <span className="inline-confirm">Excluir este registro?
                      <button className="btn small danger" type="button" onClick={async () => { await store.excluirSessao(s.id); setApagar(null); store.aviso("Registro excluído"); }}>Excluir</button>
                      <button className="btn small" type="button" onClick={() => setApagar(null)}>Cancelar</button>
                    </span>
                  ) : <button className="btn small" type="button" onClick={() => setApagar(s.id)}>Excluir</button>}
                </div>
                {s.rapido && <p className="sub" style={{ margin: "6px 0 0" }}>Registro rápido, sem séries anotadas.</p>}
                {aberto !== s.id && s.notas && <p className="sub" style={{ margin: "6px 0 0" }}>{s.notas}</p>}
                {aberto === s.id && <DetalheTreino s={s} />}
                {aberto !== s.id && s.kind === "forca" && !s.rapido && (
                  <details><summary>Ver séries</summary><ul>
                    {(s.exercicios || []).map((e) => (
                      <li key={e.id}><span>{e.nome}{e.varNome ? ` · ${e.varNome}` : ""}</span>
                        <span>{e.pulado ? "pulado" : e.semNota ? "sem anotação" : e.aConfirmar ? `aguardando o Garmin (sugerido: ${seriesText(e.series)})` : seriesText(e.series)}</span></li>
                    ))}
                  </ul></details>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

