// Fase 2: atividades do Garmin esperando a sua confirmação, e a tela de revisão de cada uma.
import { useState } from "react";
import {
  clone, DIAS_C, ddmm, dow, emMetros, fmtDist, fmtDur, fmtKg, ITEMS, parseDur, type ItemId, type Serie,
} from "../lib/dominio";
import {
  distSugerida, fichaAprendida, fichaProvavel, ITENS_DA_MOD, itemCardioProvavel, linhaPara, linhasForca, modDe, NOME_DO_TIPO,
  pendentes, seriesDoGrupo, sessaoCardio, sessaoDoDia, sessaoForca, type Acao, type AtividadeGarmin, type GrupoGarmin, type Linha,
} from "../lib/garmin";
import { useStore } from "../lib/storeContext";
import { comoFoiDe } from "../lib/comoFoi";
import ComoFoiCampos from "./ComoFoiCampos";
import { kindLabel, seriesFrom, seriesText } from "../lib/treino";

const diaTxt = (d: string) => `${DIAS_C[dow(d)]} ${ddmm(d)}`;

function haQuanto(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 2) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}

function diasAte(iso: string): number {
  return Math.round((new Date(iso + "T12:00").getTime() - Date.now()) / 86400000);
}

function resumoTxt(a: AtividadeGarmin): string {
  const r = a.resumo, mod = modDe(a), partes: string[] = [];
  if (mod === "forca") {
    const g = a.exercicios || [];
    partes.push(`${g.length} exercício${g.length === 1 ? "" : "s"}`, `${g.reduce((n, x) => n + x.series.length, 0)} séries`);
  } else if (r.dist_km && mod) partes.push(fmtDist(r.dist_km, mod));
  if (r.dur_s) partes.push(fmtDur(r.dur_s));
  if (r.fc) partes.push(`${r.fc} bpm`);
  return partes.join(" · ");
}

export default function GarminFila() {
  const store = useStore();
  const { S } = store;
  const [aberta, setAberta] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const g = S.garmin;
  if (!g) return null;
  const lista = pendentes(S);
  const atividade = lista.find((a) => a.id === aberta);
  const diasChave = g.chave_expira ? diasAte(g.chave_expira) : null;
  const avisos: string[] = [];
  if (g.ultimo_erro) avisos.push(`A última sincronização falhou: ${g.ultimo_erro}`);
  if (diasChave != null && diasChave <= 14)
    avisos.push(diasChave < 0 ? "A chave do Garmin expirou. Gere uma nova e troque na Lambda de sincronização."
      : `A chave do Garmin expira em ${diasChave} dia${diasChave === 1 ? "" : "s"}. Gere uma nova e troque na Lambda de sincronização.`);

  const sincronizar = async () => { setSincronizando(true); await store.sincronizarGarmin(); setSincronizando(false); };

  if (atividade) {
    const fechar = () => setAberta(null);
    return modDe(atividade) === "forca"
      ? <RevisaoForca key={atividade.id} a={atividade} fechar={fechar} />
      : <RevisaoCardio key={atividade.id} a={atividade} fechar={fechar} />;
  }

  return (
    <div className="card gfila">
      <div className="row">
        <h3 style={{ margin: 0 }}>Do Garmin</h3>
        <span className="sub">{g.ultima_sync ? `sincronizado ${haQuanto(g.ultima_sync)}` : "ainda não sincronizou"}</span>
        <span className="spacer" />
        <button className="btn small ghost" type="button" disabled={sincronizando} onClick={sincronizar}>
          {sincronizando ? "Sincronizando…" : "Sincronizar agora"}
        </button>
      </div>
      {avisos.map((t) => <div key={t} className="msg warn">{t}</div>)}
      {lista.length === 0 ? (
        <span className="sub">Nada esperando confirmação.</span>
      ) : (
        <>
          <span className="sub">Confira antes de entrar no histórico. O que você anotou continua valendo.</span>
          {lista.map((a) => (
            <div className="grow" key={a.id}>
              <span className="gdia">{diaTxt(a.data)}</span>
              <span className="gtxt"><b>{NOME_DO_TIPO[modDe(a)!]}</b><span className="sub">{resumoTxt(a)}</span></span>
              <span className="row" style={{ gap: 6 }}>
                <button className="btn small fill" type="button" onClick={() => setAberta(a.id)}>Revisar</button>
                <button className="btn small ghost" type="button" onClick={() => store.ignorarGarmin(a.id)}>Ignorar</button>
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- musculação

const COMO_TXT = { descricao: "pela descrição", nome: "pelo nome do Garmin", ordem: "pela ordem", manual: "escolhido por você" };

function RevisaoForca({ a, fechar }: { a: AtividadeGarmin; fechar: () => void }) {
  const store = useStore();
  const { S } = store;
  const grupos = a.exercicios || [];
  const doDia = S.sessoes.find((s) => s.data === a.data && s.kind === "forca");
  const [item, setItem] = useState<ItemId>(doDia ? doDia.item : fichaProvavel(S, a));
  const existente = sessaoDoDia(S, a.data, item);
  const [linhas, setLinhas] = useState<Linha[]>(() => linhasForca(S, item, a, existente));
  const [comoFoi, setComoFoi] = useState(() => comoFoiDe(existente));
  const [salvando, setSalvando] = useState(false);

  const trocarFicha = (k: ItemId) => {
    setItem(k);
    const ex = sessaoDoDia(S, a.data, k);
    setLinhas(linhasForca(S, k, a, ex));
    setComoFoi(comoFoiDe(ex));
  };
  const mudar = (i: number, fn: (l: Linha) => Linha) => setLinhas((ls) => ls.map((l, j) => (j === i ? fn(clone(l)) : l)));
  const usados = new Set(linhas.filter((l) => l.acao === "garmin" && l.g != null).map((l) => l.g));
  const soltos = grupos.map((g, i) => ({ g, i })).filter(({ i }) => !linhas.some((l) => l.g === i));

  const confirmar = async () => {
    setSalvando(true);
    const ok = await store.usarGarmin(a.id, { ...sessaoForca(item, a, linhas, existente), ...comoFoi });
    setSalvando(false);
    if (!ok) return;
    const ficha = fichaAprendida(S, item, a, linhas);
    if (ficha) store.salvarFicha(item as "A", ficha);
    store.aviso(`${ITEMS[item].nome} de ${ddmm(a.data)} salvo com o Garmin`);
    fechar();
  };

  return (
    <div className="card grev">
      <div className="row">
        <span className="lbl">Garmin · {diaTxt(a.data)} · {resumoTxt(a)}</span><span className="spacer" />
        <button className="btn small ghost" type="button" onClick={fechar}>Voltar</button>
      </div>
      <div className="row">
        <div className="field" style={{ minWidth: 220 }}>
          <label htmlFor="g-ficha">Treino</label>
          <select id="g-ficha" value={item} onChange={(e) => trocarFicha(e.target.value as ItemId)}>
            {ITENS_DA_MOD.forca.map((k) => <option key={k} value={k}>{ITEMS[k].nome}</option>)}
          </select>
        </div>
        <span className="sub" style={{ flex: 1, minWidth: 220 }}>
          {existente ? (existente.rapido ? "Você marcou este treino sem anotar: o Garmin completa tudo." : "Já existe registro deste treino no dia: só entra o que você não anotou.")
            : "Sem registro neste dia: o treino será criado com o que vier daqui."}
        </span>
      </div>

      {linhas.map((l, i) => (
        <LinhaForca key={l.ex.id} l={l} grupos={grupos} usados={usados}
          mudar={(fn) => mudar(i, fn)}
          escolherGrupo={(gi) => mudar(i, () => linhaPara(l.ex, l.atual, grupos, gi, gi == null ? null : "manual"))}
          modelo={(vi) => seriesFrom(S, l.ex, vi)} />
      ))}

      {soltos.length > 0 && (
        <div className="msg info">
          Do relógio, sem exercício ligado (não entram): {soltos.map(({ g }) => `${g.descricao || g.nome || g.categoria} (${g.series.length} séries)`).join(", ")}.
        </div>
      )}
      <h3 style={{ margin: "6px 0 0" }}>Como foi</h3>
      <ComoFoiCampos item={item} valor={comoFoi} mudar={setComoFoi} id={"g" + a.id} />
      <div className="save-row">
        <button className="btn ghost" type="button" onClick={fechar}>Cancelar</button>
        <button className="btn fill" type="button" disabled={salvando} onClick={confirmar}>{salvando ? "Salvando…" : "Confirmar e salvar"}</button>
      </div>
    </div>
  );
}

interface LinhaProps {
  l: Linha;
  grupos: GrupoGarmin[];
  usados: Set<number | null>;
  mudar: (fn: (l: Linha) => Linha) => void;
  escolherGrupo: (g: number | null) => void;
  modelo: (variante: number) => Serie[];
}

function LinhaForca({ l, grupos, usados, mudar, escolherGrupo, modelo }: LinhaProps) {
  const ex = l.ex, v = ex.variantes[l.variante] || ex.variantes[0], biset = !!v.biset;
  if (l.anotado) {
    return (
      <div className="gex">
        <div className="row"><b>{ex.nome}</b><span className="chip ok">você anotou: mantido</span></div>
        <span className="sub">{l.atual?.pulado ? "pulado" : seriesText(l.series)}</span>
      </div>
    );
  }
  const acao = (x: Acao) => mudar((n) => {
    n.acao = x;
    if (x === "garmin" && !n.series.length) n.series = n.g != null ? seriesDoGrupo(grupos[n.g]) : modelo(n.variante).map((s) => ({ ...s, feito: true }));
    return n;
  });
  const serie = (k: number, campo: keyof Serie, valor: string) => mudar((n) => {
    const num = parseFloat(valor.replace(",", "."));
    (n.series[k] as unknown as Record<string, number>)[campo] = isNaN(num) ? 0 : num;
    return n;
  });
  return (
    <div className="gex">
      <div className="row">
        <b>{ex.nome}</b>
        {l.g != null && l.como && <span className="sub">ligado {COMO_TXT[l.como]}</span>}
        <span className="spacer" />
        <div className="seg" role="group" aria-label={"O que fazer com " + ex.nome}>
          {([["garmin", l.g != null ? "Usar séries" : "Preencher"], ["pulado", "Pulei"], ["sem", "Sem anotação"]] as [Acao, string][]).map(([k, t]) => (
            <button key={k} type="button" aria-pressed={l.acao === k} onClick={() => acao(k)}>{t}</button>
          ))}
        </div>
      </div>
      <div className="row">
        {grupos.length > 0 && (
          <select className="inp" aria-label={"Séries do relógio para " + ex.nome} value={l.g ?? ""}
            onChange={(e) => escolherGrupo(e.target.value === "" ? null : +e.target.value)}>
            <option value="">Nada do relógio</option>
            {grupos.map((g, gi) => (
              <option key={gi} value={gi}>
                {`${gi + 1}. ${g.descricao || g.nome || g.categoria} · ${g.series.length} séries${usados.has(gi) && gi !== l.g ? " (já usado)" : ""}`}
              </option>
            ))}
          </select>
        )}
        {ex.variantes.length > 1 && l.acao === "garmin" && (
          <select className="inp" aria-label={"Variação de " + ex.nome} value={l.variante}
            onChange={(e) => mudar((n) => {
              n.variante = +e.target.value;
              if (n.g == null) n.series = modelo(n.variante).map((s) => ({ ...s, feito: true }));
              return n;
            })}>
            {ex.variantes.map((x, vi) => <option key={vi} value={vi}>{x.nome || "Opção " + (vi + 1)}</option>)}
          </select>
        )}
      </div>
      {l.aviso && <div className="msg warn">{l.aviso}</div>}
      {l.acao === "garmin" && (
        <div className="gseries">
          {l.series.map((s, k) => (
            <div className="gs" key={k}>
              <span className="sub">{kindLabel(s.t, k, l.series)}</span>
              {biset ? (
                <>
                  <input className="inp" inputMode="numeric" aria-label={`${v.biset![0]} reps, série ${k + 1}`} defaultValue={s.reps} onChange={(e) => serie(k, "reps", e.target.value)} />
                  <span className="sub">+</span>
                  <input className="inp" inputMode="numeric" aria-label={`${v.biset![1]} reps, série ${k + 1}`} defaultValue={s.reps2 ?? 0} onChange={(e) => serie(k, "reps2", e.target.value)} />
                  <span className="sub">reps</span>
                </>
              ) : (
                <>
                  <input className="inp" inputMode="decimal" aria-label={`Carga, série ${k + 1}`} defaultValue={fmtKg(s.kg)} onChange={(e) => serie(k, "kg", e.target.value)} />
                  <span className="sub">kg ×</span>
                  <input className="inp" inputMode="numeric" aria-label={`Repetições, série ${k + 1}`} defaultValue={s.reps} onChange={(e) => serie(k, "reps", e.target.value)} />
                </>
              )}
              <button className="btn small ghost" type="button" aria-label={`Apagar série ${k + 1}`}
                onClick={() => mudar((n) => { n.series.splice(k, 1); if (!n.series.length) n.acao = "sem"; return n; })}>×</button>
            </div>
          ))}
          <button className="btn small ghost" type="button"
            onClick={() => mudar((n) => { const u = n.series[n.series.length - 1]; n.series.push(u ? { ...u, t: "S" } : { t: "S", kg: 0, reps: 0, feito: true }); return n; })}>
            + série
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- cardio

function RevisaoCardio({ a, fechar }: { a: AtividadeGarmin; fechar: () => void }) {
  const store = useStore();
  const { S } = store;
  const mod = modDe(a) as Exclude<ReturnType<typeof modDe>, "forca" | null>;
  const opcoes = ITENS_DA_MOD[mod];
  const [item, setItem] = useState<ItemId>(itemCardioProvavel(S, a));
  const existente = sessaoDoDia(S, a.data, item);
  const atual = existente?.cardio;
  const metros = emMetros(mod);
  const sugDist = distSugerida(a);
  const inicial = () => ({
    dist: atual?.dist ?? sugDist,
    dur: fmtDurEdit(atual?.dur_s ?? a.resumo.dur_s),
    fc: atual?.fc ?? a.resumo.fc,
  });
  const [campos, setCampos] = useState(inicial);
  const [comoFoi, setComoFoi] = useState(() => comoFoiDe(existente));
  const [rev, setRev] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const r = a.resumo;

  const trocar = (k: ItemId) => {
    setItem(k);
    const ex = sessaoDoDia(S, a.data, k)?.cardio;
    setCampos({ dist: ex?.dist ?? sugDist, dur: fmtDurEdit(ex?.dur_s ?? r.dur_s), fc: ex?.fc ?? r.fc });
    setComoFoi(comoFoiDe(sessaoDoDia(S, a.data, k)));
    setRev((x) => x + 1);
  };
  const confirmar = async () => {
    setSalvando(true);
    const ok = await store.usarGarmin(a.id, { ...sessaoCardio(a, item, { dist: campos.dist, dur_s: parseDur(campos.dur), fc: campos.fc }, existente), ...comoFoi });
    setSalvando(false);
    if (ok) { store.aviso(`${ITEMS[item].nome} de ${ddmm(a.data)} salvo com o Garmin`); fechar(); }
  };
  const nota = (anotado: unknown, garmin: string) => (anotado != null ? `Você anotou; o Garmin tem ${garmin}` : `Do Garmin`);
  const extras = [
    r.fc_max && `FC máx. ${r.fc_max} bpm`, r.cadencia && `cadência ${r.cadencia} ${mod === "corrida" ? "ppm" : "rpm"}`,
    r.elevacao_m && `subida ${Math.round(r.elevacao_m)} m`, r.te_aerobico && `efeito aeróbico ${fmtKg(r.te_aerobico)}`,
    r.te_anaerobico && `anaeróbico ${fmtKg(r.te_anaerobico)}`, r.calorias && `${r.calorias} kcal`,
  ].filter(Boolean);

  return (
    <div className="card grev">
      <div className="row">
        <span className="lbl">Garmin · {diaTxt(a.data)} · {NOME_DO_TIPO[mod]}</span><span className="spacer" />
        <button className="btn small ghost" type="button" onClick={fechar}>Voltar</button>
      </div>
      <div className="row">
        {opcoes.length > 1 ? (
          <div className="field" style={{ minWidth: 220 }}>
            <label htmlFor="g-item">Treino</label>
            <select id="g-item" value={item} onChange={(e) => trocar(e.target.value as ItemId)}>
              {opcoes.map((k) => <option key={k} value={k}>{ITEMS[k].nome}</option>)}
            </select>
          </div>
        ) : <b>{ITEMS[item].nome}</b>}
        <span className="sub" style={{ flex: 1, minWidth: 220 }}>
          {existente ? "Já existe registro deste treino no dia: o que você anotou continua valendo." : "Sem registro neste dia: o treino será criado com estes dados."}
        </span>
      </div>
      <div className="grid3" key={rev}>
        <div className="field">
          <label htmlFor="g-dist">Distância ({metros ? "m" : "km"})</label>
          <input id="g-dist" inputMode="decimal" defaultValue={campos.dist == null ? "" : metros ? Math.round(campos.dist * 1000) : String(campos.dist).replace(".", ",")}
            placeholder={mod === "bike" ? "anote a sua" : ""}
            onChange={(e) => { const n = parseFloat(e.target.value.replace(",", ".")); setCampos((c) => ({ ...c, dist: isNaN(n) || !n ? null : metros ? n / 1000 : n })); }} />
          <span className="sub">{mod === "bike" ? "A bike indoor vem zerada do Garmin: vale a que você anotar." : nota(atual?.dist, r.dist_km ? fmtDist(r.dist_km, mod) : "nada")}</span>
        </div>
        <div className="field">
          <label htmlFor="g-dur">Tempo (h:mm:ss)</label>
          <input id="g-dur" defaultValue={campos.dur} onChange={(e) => setCampos((c) => ({ ...c, dur: e.target.value }))} />
          <span className="sub">{nota(atual?.dur_s, r.dur_s ? fmtDur(r.dur_s) : "nada")}</span>
        </div>
        <div className="field">
          <label htmlFor="g-fc">FC média (bpm)</label>
          <input id="g-fc" inputMode="numeric" defaultValue={campos.fc ?? ""}
            onChange={(e) => { const n = parseInt(e.target.value, 10); setCampos((c) => ({ ...c, fc: isNaN(n) ? null : n })); }} />
          <span className="sub">{nota(atual?.fc, r.fc ? `${r.fc} bpm` : "nada")}</span>
        </div>
      </div>
      {extras.length > 0 && <span className="sub">Também guardado: {extras.join(" · ")}{a.voltas && a.voltas.length > 1 ? ` · ${a.voltas.length} parciais` : ""}.</span>}
      <h3 style={{ margin: "6px 0 0" }}>Como foi</h3>
      <ComoFoiCampos item={item} valor={comoFoi} mudar={setComoFoi} id={"g" + a.id} />
      <div className="save-row">
        <button className="btn ghost" type="button" onClick={fechar}>Cancelar</button>
        <button className="btn fill" type="button" disabled={salvando} onClick={confirmar}>{salvando ? "Salvando…" : "Confirmar e salvar"}</button>
      </div>
    </div>
  );
}

/** Tempo para editar: "h:mm:ss" ou "mm:ss" (o mesmo formato que o campo aceita de volta). */
function fmtDurEdit(s: number | null | undefined): string {
  return s ? fmtDur(s) : "";
}
