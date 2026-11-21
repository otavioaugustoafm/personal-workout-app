import { useState } from "react";
import { addDays, DIAS, DIAS_C, ddmm, ITEMS, mondayOf, isoToday, uid, type ItemId, type Sessao } from "../lib/dominio";
import { dayState, diaSemResposta, mainItem, treinoDeHoje, weekInfo, type Semana } from "../lib/semana";
import { useStore } from "../lib/storeContext";
import { cardioLine, doresTexto, exValido, volume } from "../lib/treino";
import { fmtInt } from "../lib/dominio";
import GarminFila from "./GarminFila";
import Treino from "./Treino";

export function ResumoSessao({ s }: { s: Sessao }) {
  const it = ITEMS[s.item] || ITEMS.OFF;
  let t: string;
  if (s.kind === "forca") {
    const ex = s.exercicios || [];
    const pul = ex.filter((e) => e.pulado).length, gar = ex.filter((e) => e.aConfirmar).length, sem = ex.filter((e) => e.semNota).length;
    t = s.rapido ? "Registro rápido, sem séries anotadas."
      : `${ex.filter(exValido).length} exercícios anotados · volume ${fmtInt(volume(s))} kg${pul ? ` · ${pul} pulado${pul > 1 ? "s" : ""}` : ""}${gar ? ` · ${gar} aguardando o Garmin` : ""}${sem ? ` · ${sem} sem anotação` : ""}`;
  } else if (s.kind === "cardio") t = cardioLine(s) || "Sem distância ou tempo anotados.";
  else t = "Descanso registrado.";
  const extra = [doresTexto(s, true), s.notas].filter(Boolean).join(" · ");
  return (
    <div className="sumline">
      <b>{it.nome}</b>
      <span className="sub">{t}{extra ? " · " + extra : ""}</span>
    </div>
  );
}

export default function Hoje() {
  const store = useStore();
  const { S } = store;
  const w = weekInfo(S);
  const [diaSel, setDiaSel] = useState(w.ti);
  const [desfazer, setDesfazer] = useState<string | null>(null);
  const [outro, setOutro] = useState<{ data: string | null } | null>(null); // registrar outro treino (hoje ou num dia que passou)

  const ask = diaSemResposta(S, w);
  const dataDo = (i: number) => addDays(mondayOf(isoToday()), i);

  const registroRapido = async (i: number) => {
    const it = S.padrao[i], d = dataDo(i);
    const ok = await store.registrarSessao({
      id: uid(), ts: Date.now(), data: d, item: it, kind: ITEMS[it].kind, rapido: true, exercicios: [], dores: {},
      sensacao: null, notas: "", garmin: null,
    });
    if (ok) store.aviso(`${ITEMS[it].nome} registrado em ${ddmm(d)}`);
  };
  const naoTreinei = (i: number) => store.salvarConfig({ respondidos: { ...S.respondidos, [dataDo(i)]: "nao" } });
  const recomecar = () => {
    const t = isoToday();
    const resp: Record<string, "nao"> = {};
    Object.entries(S.respondidos).forEach(([k, v]) => { if (k >= t) resp[k] = v; });
    store.salvarConfig({ inicio: t, respondidos: resp });
    store.aviso("Semana recomeçada a partir de hoje");
  };
  const removerDia = async (d: string) => {
    await store.excluirDia(d);
    setDesfazer(null);
    store.aviso("Registro removido");
  };
  const abrirOutro = (data: string | null) => { setOutro({ data }); setDiaSel(w.ti); window.scrollTo(0, 0); };

  const confirmarRemocao = (d: string, texto: string) => desfazer === d ? (
    <span className="inline-confirm">{texto}
      <button className="btn small danger" type="button" onClick={() => removerDia(d)}>Remover</button>
      <button className="btn small ghost" type="button" onClick={() => setDesfazer(null)}>Cancelar</button>
    </span>
  ) : null;

  return (
    <>
      {ask >= 0 && (
        <div className="card askcard">
          <div style={{ flex: 1, minWidth: 220 }}>
            <b>{DIAS[ask]} ({ddmm(w.dates[ask])}) ficou sem registro.</b>
            <div className="sub">O padrão era {ITEMS[w.padrao[ask]].nome}. Você treinou?</div>
          </div>
          <div className="row">
            <button className="btn fill small" type="button" onClick={() => registroRapido(ask)}>Sim, fiz {ITEMS[w.padrao[ask]].curto}</button>
            <button className="btn small" type="button" onClick={() => abrirOutro(w.dates[ask])}>Fiz outro treino</button>
            <button className="btn small ghost" type="button" onClick={() => naoTreinei(ask)}>Não treinei</button>
          </div>
        </div>
      )}

      <GarminFila />

      <div className="strip" role="group" aria-label="Dias da semana">
        {w.dates.map((d, i) => {
          const ds = dayState(w, i);
          return (
            <button key={d} type="button" className={"sday " + ds.st} aria-pressed={i === diaSel} style={{ "--c": ITEMS[ds.it].c } as React.CSSProperties}
              onClick={() => { setDiaSel(i); setDesfazer(null); }}>
              <span className="dn">{DIAS_C[i]}</span><span className="dd">{ddmm(d)}</span><i className="dot" />
              <span className="dl">{ITEMS[ds.it].curto}</span><span className="st">{ds.st === "done" ? "✓ feito" : ds.label}</span>
            </button>
          );
        })}
      </div>

      {w.deviated && (
        <div className="banner">
          <div className="msg info">
            A semana mudou em relação ao padrão e os dias que faltam foram reorganizados
            {w.dropped.length ? `; não coube: ${w.dropped.map((it) => ITEMS[it].nome).join(", ")}` : ""}. Na segunda tudo volta ao padrão.
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn small" type="button" onClick={recomecar}>Recomeçar a partir de hoje</button>
              <span className="sub">Os dias que já passaram deixam de contar como falta.</span>
            </div>
          </div>
        </div>
      )}

      {diaSel !== w.ti ? (
        <DetalheDia w={w} i={diaSel} voltar={() => setDiaSel(w.ti)} pedirDesfazer={setDesfazer}
          confirmar={confirmarRemocao} registroRapido={registroRapido} abrirOutro={abrirOutro} />
      ) : (
        <AreaDeHoje w={w} outro={outro} fecharOutro={() => setOutro(null)} abrirOutro={abrirOutro}
          pedirDesfazer={setDesfazer} confirmar={confirmarRemocao} />
      )}
    </>
  );
}

interface DetalheProps {
  w: Semana;
  i: number;
  voltar: () => void;
  pedirDesfazer: (d: string) => void;
  confirmar: (d: string, texto: string) => React.ReactNode;
  registroRapido: (i: number) => void;
  abrirOutro: (data: string | null) => void;
}

function DetalheDia({ w, i, voltar, pedirDesfazer, confirmar, registroRapido, abrirOutro }: DetalheProps) {
  const { S } = useStore();
  const ds = dayState(w, i), it = ITEMS[ds.it], done = w.byDay[i], std = w.padrao[i], d = w.dates[i];
  let corpo: React.ReactNode;
  let acoes: React.ReactNode = null;
  if (ds.st === "done") {
    corpo = done.map((s) => <ResumoSessao key={s.id} s={s} />);
    acoes = confirmar(d, "Remover o registro deste dia?") ?? (
      <>
        <button className="btn small ghost" type="button" onClick={() => pedirDesfazer(d)}>Desfazer registro</button>
        <button className="btn small" type="button" onClick={() => abrirOutro(d)}>Registrar outro treino neste dia</button>
      </>
    );
  } else if (ds.st === "miss" || ds.st === "pre") {
    const conf = S.respondidos[d] === "nao";
    corpo = <p className="sub" style={{ margin: 0 }}>{ds.st === "pre" ? "Antes de você começar a usar o app. Não conta como falta." : "Sem registro neste dia."}</p>;
    if (std !== "OFF") acoes = (
      <>
        {conf
          ? <button className="btn small ghost" type="button" onClick={() => registroRapido(i)}>Corrigir: eu treinei</button>
          : <button className="btn small fill" type="button" onClick={() => registroRapido(i)}>Fiz {it.curto}{ds.st === "miss" ? ", mas não anotei" : ""}</button>}
        <button className="btn small" type="button" onClick={() => abrirOutro(d)}>Fiz outro treino</button>
      </>
    );
  } else {
    corpo = (
      <>
        {it.det && <p style={{ margin: 0 }}>{it.det}</p>}
        <p className="sub" style={{ margin: 0 }}>
          {ds.st === "adj" ? `Padrão do dia: ${ITEMS[std].nome}. Mudou porque a semana foi reorganizada.` : "Treino previsto."}
        </p>
      </>
    );
  }
  return (
    <div className="card daydetail" style={{ "--c": it.c } as React.CSSProperties}>
      <div className="row">
        <span className="lbl">{DIAS[i]} · {ddmm(d)}</span><span className="spacer" />
        <button className="btn small ghost" type="button" onClick={voltar}>Voltar para hoje</button>
      </div>
      <h2 className="big2">{ITEMS[ds.it].nome}</h2>
      {corpo}
      {acoes && <div className="row" style={{ marginTop: 4 }}>{acoes}</div>}
      {w.alerts[i] && done.length > 0 && <div className="msg bad">{w.alerts[i]}</div>}
    </div>
  );
}

interface AreaProps {
  w: Semana;
  outro: { data: string | null } | null;
  fecharOutro: () => void;
  abrirOutro: (data: string | null) => void;
  pedirDesfazer: (d: string) => void;
  confirmar: (d: string, texto: string) => React.ReactNode;
}

function AreaDeHoje({ w, outro, fecharOutro, abrirOutro, pedirDesfazer, confirmar }: AreaProps) {
  const { S } = useStore();
  const done = w.byDay[w.ti], d = w.dates[w.ti];
  if (done.length && !outro) {
    let prox: { it: ItemId; dia: string } | null = null;
    for (let i = w.ti + 1; i < 7; i++) if (w.rec[i]) { prox = { it: w.rec[i]!, dia: i === w.ti + 1 ? "Amanhã" : DIAS[i] }; break; }
    if (!prox) prox = { it: S.padrao[0], dia: "Segunda" };
    return (
      <div className="card daydetail" style={{ "--c": ITEMS[mainItem(done)!].c } as React.CSSProperties}>
        <span className="lbl">Hoje · {ddmm(d)}</span>
        <h2 className="big2" style={{ color: "var(--ok)" }}>Treino feito</h2>
        {done.map((s) => <ResumoSessao key={s.id} s={s} />)}
        <div className="row" style={{ marginTop: 4 }}>
          {confirmar(d, "Remover o registro de hoje?") ?? (
            <>
              <button className="btn small ghost" type="button" onClick={() => pedirDesfazer(d)}>Desfazer registro</button>
              <button className="btn small" type="button" onClick={() => abrirOutro(null)}>Registrar outro treino hoje</button>
            </>
          )}
        </div>
        <div className="sep-line" />
        <div className="row"><span className="sub">{prox.dia}</span>
          <b style={{ fontFamily: "var(--display)", fontSize: 20, color: "var(--gold)" }}>{ITEMS[prox.it].nome}</b></div>
      </div>
    );
  }
  const inicial = outro ? (outro.data ? S.padrao[(new Date(outro.data + "T12:00").getDay() + 6) % 7] : "A") : treinoDeHoje(S);
  return <Treino key={(outro?.data || "hoje") + (outro ? "-outro" : "")} itemInicial={inicial} dataFixa={outro?.data || null}
    extra={!!outro} onCancelar={outro ? fecharOutro : undefined} onSalvo={fecharOutro} />;
}
