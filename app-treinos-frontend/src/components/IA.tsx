// Análises da IA (texto guardado no banco) e o cartão de prontidão do dia.
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { DORES, fmtDateLong, isoToday, ITEMS, dow } from "../lib/dominio";
import { corFaixa, fmtUsd, NOME_MODELO, type TipoIA } from "../lib/saude";
import { useStore } from "../lib/storeContext";

/** Negrito com **texto** dentro de uma linha. */
function inline(t: string): ReactNode[] {
  return t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>));
}

/** O texto da IA: parágrafos e tópicos com "- ". */
export function TextoIA({ texto }: { texto: string }) {
  const blocos: ReactNode[] = [];
  let lista: string[] = [];
  const fechar = () => {
    if (lista.length) blocos.push(<ul key={blocos.length}>{lista.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    lista = [];
  };
  texto.split("\n").forEach((linha) => {
    const l = linha.trim();
    if (/^[-•*]\s+/.test(l)) { lista.push(l.replace(/^[-•*]\s+/, "")); return; }
    fechar();
    if (l) blocos.push(<p key={blocos.length}>{inline(l.replace(/^#+\s*/, ""))}</p>);
  });
  fechar();
  return <div className="ia-texto">{blocos}</div>;
}

const tentadas = new Set<string>();

interface Props { tipo: TipoIA; chave: string; titulo: string; auto?: boolean; vazio?: string }

export function AnaliseIA({ tipo, chave, titulo, auto = false, vazio }: Props) {
  const store = useStore();
  const ia = store.S.ia;
  const analise = ia?.analises.find((a) => a.tipo === tipo && a.chave === chave);
  const [gerando, setGerando] = useState(false);
  const [falhouAuto, setFalhouAuto] = useState(false);
  const id = tipo + ":" + chave;
  const vaiGerarSozinho = auto && !analise && !!ia?.configurada && !falhouAuto && ia.gasto_mes < ia.limite_auto;

  useEffect(() => {
    if (!vaiGerarSozinho || tentadas.has(id)) return;
    tentadas.add(id);
    store.analisar(tipo, chave, { auto: true }).then((a) => { if (!a) setFalhouAuto(true); });
  }, [vaiGerarSozinho, id, store, tipo, chave]);

  if (!ia) return null;
  const gerar = async () => {
    setGerando(true);
    await store.analisar(tipo, chave, { forcar: !!analise });
    setGerando(false);
  };
  const ocupado = gerando || (vaiGerarSozinho && tentadas.has(id));
  return (
    <section className="card ia">
      <div className="row">
        <span className="ia-selo" aria-hidden="true">IA</span>
        <h3 style={{ margin: 0 }}>{titulo}</h3>
        <span className="spacer" />
        {ia.configurada && (
          <button className="btn small ghost" type="button" disabled={ocupado} onClick={gerar}>
            {ocupado ? "Analisando…" : analise ? "Refazer" : "Gerar análise"}
          </button>
        )}
      </div>
      {!ia.configurada ? (
        <span className="sub">A IA ainda não está ligada: falta a chave da Anthropic na Lambda da API (veja o guia, seção Fase 3).</span>
      ) : analise ? (
        <>
          <TextoIA texto={analise.texto} />
          <span className="sub ia-meta">
            {NOME_MODELO[analise.modelo] || analise.modelo} · {new Date(analise.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            {" · "}{fmtUsd(analise.custo_usd)} · mês: {fmtUsd(ia.gasto_mes)} de {fmtUsd(ia.limite)}
          </span>
        </>
      ) : ocupado ? (
        <span className="sub">Analisando seus dados…</span>
      ) : (
        <span className="sub">
          {vazio || "Ainda sem análise."}
          {ia.gasto_mes >= ia.limite_auto && " As análises automáticas pararam: o gasto do mês chegou ao teto automático."}
        </span>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- prontidão do dia

function Anel({ nota }: { nota: number }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <svg className="anel" viewBox="0 0 84 84" role="img" aria-label={`Prontidão ${nota} de 100`}>
      <circle cx="42" cy="42" r={r} fill="none" stroke="var(--line)" strokeWidth="7" />
      <circle cx="42" cy="42" r={r} fill="none" stroke={corFaixa(nota)} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${(nota / 100) * c} ${c}`} transform="rotate(-90 42 42)" />
      <text x="42" y="48" textAnchor="middle" className="anel-n">{nota}</text>
    </svg>
  );
}

let sincronizouAoAbrir = false;
const msDesde = (iso: string) => Date.now() - new Date(iso).getTime();

export function ProntidaoHoje() {
  const store = useStore();
  const { S } = store;
  const hoje = isoToday();
  const dia = S.saude?.find((d) => d.data === hoje);
  const ultima = S.garmin?.ultima_sync ? msDesde(S.garmin.ultima_sync) : Infinity;
  const precisaSync = !!S.garmin && !dia?.sono && ultima > 20 * 60000;
  const [sincronizando, setSincronizando] = useState(false);
  const pediu = useRef(false);

  // abriu o app de manhã e o sono de hoje ainda não chegou: busca no Garmin uma vez, sem aviso
  useEffect(() => {
    if (!precisaSync || sincronizouAoAbrir || pediu.current) return;
    sincronizouAoAbrir = pediu.current = true;
    store.sincronizarGarmin(true);
  }, [precisaSync, store]);

  if (!S.saude) return null;
  const p = dia?.prontidao;
  const plano = S.padrao[dow(hoje)];
  const sincronizar = async () => { setSincronizando(true); await store.sincronizarGarmin(); setSincronizando(false); };
  return (
    <div className="prontidao">
      <div className="card pr-card">
        {p ? (
          <>
            <Anel nota={p.nota} />
            <div className="pr-info">
              <span className="k">Prontidão de hoje</span>
              <b style={{ color: corFaixa(p.nota) }}>{p.faixa === "alta" ? "Pronto para treinar forte" : p.faixa === "moderada" ? "Treine, mas com controle" : "Dia de pegar leve"}</b>
              <span className="sub">Planejado: {ITEMS[plano]?.nome || "—"}{!p.completa && " · nota parcial (faltam dados do relógio)"}</span>
            </div>
            <div className="pr-partes">
              {Object.entries(p.partes).map(([k, x]) => (
                <div key={k} className="pr-parte" title={x.txt}>
                  <span>{x.nome}</span>
                  <span className="barra"><span style={{ width: x.nota + "%", background: corFaixa(x.nota) }} /></span>
                  <span className="sub">{x.txt}</span>
                </div>
              ))}
              {p.dor_recente.length > 0 && <span className="chip bad">Doeu nos últimos 3 dias: {p.dor_recente.map((d) => (DORES[d] || d).toLowerCase()).join(", ")} (−10)</span>}
            </div>
          </>
        ) : (
          <div className="pr-info">
            <span className="k">Prontidão de hoje</span>
            <span className="sub">{sincronizando || precisaSync ? "Buscando o sono de hoje no Garmin…" : "O sono de hoje ainda não chegou do relógio. Sincronize o relógio com o celular e depois toque em Sincronizar."}</span>
            <button className="btn small ghost" type="button" disabled={sincronizando} onClick={sincronizar} style={{ alignSelf: "flex-start" }}>Sincronizar agora</button>
          </div>
        )}
      </div>
      {p && <AnaliseIA tipo="prontidao" chave={hoje} titulo={`O que fazer hoje · ${fmtDateLong(hoje)}`} auto={!!dia?.sono} />}
    </div>
  );
}
