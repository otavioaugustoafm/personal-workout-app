import { useState } from "react";
import { clone, DIAS, ITEMS, STANDARD, uid, type Exercicio, type FichaId, type ItemId, type Serie } from "../lib/dominio";
import fichasPadrao from "../lib/fichasPadrao.json";
import { checkPadrao, fichaDoDia } from "../lib/semana";
import { useStore } from "../lib/storeContext";
import { OpcoesTreino } from "./Treino";

const ABD_LIVRE = ["Abdominal no chão", "Elevação de pernas"];

export default function Plano() {
  const store = useStore();
  const { S } = store;
  const avisos = checkPadrao(S.padrao);
  return (
    <>
      <div className="section" style={{ marginTop: 0 }}>
        <h2>Semana padrão</h2>
        <p className="sub" style={{ margin: "0 0 10px" }}>
          A recomendação parte daqui toda segunda. Se você faltar ou trocar um treino, o app reorganiza só os dias restantes daquela semana.
        </p>
        <div className="std-grid">
          {S.padrao.map((it, i) => (
            <div className="field" key={i}>
              <label htmlFor={"std-" + i}>{DIAS[i]}</label>
              <select id={"std-" + i} value={it} onChange={(e) => {
                const p = S.padrao.slice(); p[i] = e.target.value as ItemId; store.salvarConfig({ padrao: p });
              }}><OpcoesTreino /></select>
            </div>
          ))}
        </div>
        <div className="banner" style={{ marginTop: 10 }}>
          {avisos.length ? avisos.map((m, i) => <div key={i} className={"msg " + m.lvl}>{m.txt}</div>) : <div className="msg ok">Semana padrão sem conflito com o joelho.</div>}
        </div>
        {S.padrao.join() !== STANDARD.join() && (
          <button className="btn small" type="button" onClick={() => store.salvarConfig({ padrao: STANDARD.slice() })}>Voltar à semana sugerida</button>
        )}
        <details className="card" style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Como a semana é reorganizada</summary>
          <div className="rules">
            <div className="rule"><h3>Perna isolada</h3><p>Nada de corrida ou bike no dia da perna nem no dia seguinte.</p></div>
            <div className="rule"><h3>Longão longe da perna</h3><p>Perna na quinta à noite e longão no domingo cedo dão cerca de 60 horas, depois do pico de dor muscular (24 a 48 h).</p></div>
            <div className="rule"><h3>Se você faltar</h3><p>Perna, Peito, Costas e Longão entram no lugar do treino menos importante que ainda vem (Ombro, depois Bike, depois Corrida). Corrida de qualidade, Bike e Ombro perdidos só caem.</p></div>
            <div className="rule"><h3>Semana seguinte protegida</h3><p>O fim de semana nunca é montado de um jeito que atrapalhe a segunda e a terça seguintes.</p></div>
          </div>
        </details>
      </div>
      <div className="section">
        <h2>Fichas</h2>
        <EditorFichas />
      </div>
    </>
  );
}

function EditorFichas() {
  const store = useStore();
  const { S } = store;
  const [k, setK] = useState<FichaId>(() => (fichaDoDia(S)?.k as FichaId) || "A");
  const [rev, setRev] = useState(0);
  const [apagarEx, setApagarEx] = useState<string | null>(null);
  const [restaurar, setRestaurar] = useState(false);
  const fd = fichaDoDia(S);
  const f = S.fichas[k];

  /** Altera a ficha. "estrutura" refaz os campos (mover, remover, adicionar). */
  const mudar = (fn: (lista: Exercicio[]) => void, estrutura = false) => {
    const nova = clone(f);
    fn(nova);
    store.salvarFicha(k, nova);
    if (estrutura) setRev((r) => r + 1);
  };
  const num = (v: string) => { const n = parseFloat(v.replace(",", ".")); return isNaN(n) ? 0 : n; };

  return (
    <>
      <div className="row" style={{ margin: "10px 0 12px" }}>
        <div className="seg" role="group" aria-label="Ficha">
          {(["A", "B", "C", "D"] as FichaId[]).map((x) => (
            <button key={x} type="button" aria-pressed={x === k} onClick={() => { setK(x); setApagarEx(null); setRestaurar(false); setRev((r) => r + 1); }}>
              {ITEMS[x].nome}
              {fd && fd.k === x && <span className={"pill " + (fd.hoje ? "today" : "next")} style={{ marginLeft: 4 }}>{fd.hoje ? "Hoje" : fd.dia}</span>}
            </button>
          ))}
        </div>
        <span className="spacer" />
        {restaurar ? (
          <span className="inline-confirm">Voltar esta ficha ao original?
            <button className="btn small danger" type="button" onClick={() => {
              store.salvarFicha(k, clone((fichasPadrao as unknown as Record<FichaId, Exercicio[]>)[k]));
              setRestaurar(false); setRev((r) => r + 1); store.aviso("Ficha restaurada");
            }}>Restaurar</button>
            <button className="btn small" type="button" onClick={() => setRestaurar(false)}>Cancelar</button>
          </span>
        ) : <button className="btn small" type="button" onClick={() => setRestaurar(true)}>Restaurar ficha original</button>}
      </div>
      <p className="sub" style={{ margin: "0 0 12px", maxWidth: "85ch" }}>
        As mudanças valem a partir do próximo treino e ficam salvas na hora. Renomear um exercício mantém o histórico dele. O <b>nome no Garmin</b> é o nome que
        o relógio mostra para esse exercício; é ele que liga as séries do Garmin às suas na Fase 2.
      </p>
      <div className="edit-list">
        {f.map((e, n) => (
          <article className="edit-ex" key={e.id + "-" + rev}>
            <div className="edit-h">
              <span className="num">{String(n + 1).padStart(2, "0")}</span><h3>{e.nome}</h3><span className="spacer" />
              <button className="btn small ghost" type="button" disabled={n === 0} aria-label="Subir"
                onClick={() => mudar((l) => { l.splice(n - 1, 0, l.splice(n, 1)[0]); }, true)}>↑</button>
              <button className="btn small ghost" type="button" disabled={n === f.length - 1} aria-label="Descer"
                onClick={() => mudar((l) => { l.splice(n + 1, 0, l.splice(n, 1)[0]); }, true)}>↓</button>
              {apagarEx === e.id ? (
                <span className="inline-confirm">Remover da ficha?
                  <button className="btn small danger" type="button" onClick={() => { mudar((l) => { l.splice(n, 1); }, true); setApagarEx(null); }}>Remover</button>
                  <button className="btn small" type="button" onClick={() => setApagarEx(null)}>Cancelar</button>
                </span>
              ) : <button className="btn small ghost danger" type="button" onClick={() => setApagarEx(e.id)}>Remover</button>}
            </div>
            <div className="edit-grid">
              <div className="field"><label htmlFor={"n-" + e.id}>Nome</label>
                <input id={"n-" + e.id} defaultValue={e.nome} onChange={(ev) => mudar((l) => { l[n].nome = ev.target.value; })} /></div>
              <div className="field"><label htmlFor={"g-" + e.id}>Nome no Garmin</label>
                <input id={"g-" + e.id} defaultValue={e.garmin} disabled={!!e.manual} placeholder={e.manual ? "Não usado: você preenche" : "Como aparece no relógio"}
                  onChange={(ev) => mudar((l) => { l[n].garmin = ev.target.value; })} />
                <label className="bichk" style={{ marginTop: 4 }}>
                  <input type="checkbox" checked={!!e.manual} onChange={(ev) => mudar((l) => { l[n].manual = ev.target.checked; }, true)} /> Preencher à mão (não puxar do Garmin)
                </label></div>
              <div className="field"><label htmlFor={"a-" + e.id}>Ajuste da máquina</label>
                <input id={"a-" + e.id} defaultValue={e.ajuste} placeholder="Ex.: uma bolinha abaixo do 6" onChange={(ev) => mudar((l) => { l[n].ajuste = ev.target.value; })} /></div>
            </div>
            {e.variantes.map((v, vi) => (
              <div className="variant" key={vi}>
                <div className="row">
                  {e.variantes.length > 1
                    ? <div className="field" style={{ maxWidth: 220 }}><label htmlFor={`v-${e.id}-${vi}`}>Variação</label>
                      <input id={`v-${e.id}-${vi}`} defaultValue={v.nome} onChange={(ev) => mudar((l) => { l[n].variantes[vi].nome = ev.target.value; })} /></div>
                    : <span className="lbl">Séries</span>}
                  <span className="spacer" />
                  {e.variantes.length > 1 && <button className="btn small ghost danger" type="button" onClick={() => mudar((l) => { l[n].variantes.splice(vi, 1); }, true)}>Remover variação</button>}
                </div>
                <label className="bichk" style={{ alignSelf: "flex-start" }}>
                  <input type="checkbox" checked={!!v.biset} onChange={(ev) => mudar((l) => {
                    const vv = l[n].variantes[vi];
                    if (ev.target.checked) { vv.biset = ABD_LIVRE.slice(); vv.series = vv.series.map((x) => ({ ...x, kg2: 0, reps2: x.reps })); }
                    else { delete vv.biset; vv.series = vv.series.map((x) => { const c = { ...x }; delete c.kg2; delete c.reps2; return c; }); }
                  }, true)} /> Bi-set (dois exercícios em cada série)
                </label>
                {v.biset && (
                  <div className="edit-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                    {[0, 1].map((b) => (
                      <div className="field" key={b}><label htmlFor={`bn-${e.id}-${vi}-${b}`}>Exercício {b + 1} do bi-set</label>
                        <input id={`bn-${e.id}-${vi}-${b}`} defaultValue={v.biset![b]} onChange={(ev) => mudar((l) => { l[n].variantes[vi].biset![b] = ev.target.value; })} /></div>
                    ))}
                  </div>
                )}
                <div className="tbl-wrap"><table className="sets">
                  <thead><tr><th>Tipo</th>{v.biset ? <><th>{v.biset[0]}: reps</th><th>kg</th><th>{v.biset[1]}: reps</th><th>kg</th></> : <><th>Carga (kg)</th><th>Reps</th></>}<th /></tr></thead>
                  <tbody>{v.series.map((s, si) => {
                    const set = (campo: keyof Serie, val: number | string) => mudar((l) => { (l[n].variantes[vi].series[si] as unknown as Record<string, number | string>)[campo] = val; });
                    return (
                      <tr key={si}>
                        <td><select aria-label={`Tipo da série ${si + 1}`} defaultValue={s.t} onChange={(ev) => set("t", ev.target.value)}>
                          <option value="F">Feeder</option><option value="A">Aquecimento</option><option value="S">Série</option></select></td>
                        {v.biset ? (
                          <>
                            <td><input type="number" step={1} min={0} aria-label="Repetições do exercício 1" defaultValue={s.reps} onChange={(ev) => set("reps", num(ev.target.value))} /></td>
                            <td><input type="number" step={0.5} min={0} aria-label="Carga do exercício 1" defaultValue={s.kg} onChange={(ev) => set("kg", num(ev.target.value))} /></td>
                            <td><input type="number" step={1} min={0} aria-label="Repetições do exercício 2" defaultValue={s.reps2 || 0} onChange={(ev) => set("reps2", num(ev.target.value))} /></td>
                            <td><input type="number" step={0.5} min={0} aria-label="Carga do exercício 2" defaultValue={s.kg2 || 0} onChange={(ev) => set("kg2", num(ev.target.value))} /></td>
                          </>
                        ) : (
                          <>
                            <td><input type="number" step={0.5} min={0} aria-label="Carga" defaultValue={s.kg} onChange={(ev) => set("kg", num(ev.target.value))} /></td>
                            <td><input type="number" step={1} min={0} aria-label="Repetições" defaultValue={s.reps} onChange={(ev) => set("reps", num(ev.target.value))} /></td>
                          </>
                        )}
                        <td>{v.series.length > 1 && <button className="btn small ghost danger" type="button" aria-label={`Remover série ${si + 1}`}
                          onClick={() => mudar((l) => { l[n].variantes[vi].series.splice(si, 1); }, true)}>×</button>}</td>
                      </tr>
                    );
                  })}</tbody>
                </table></div>
                <div className="row"><button className="btn small ghost" type="button" onClick={() => mudar((l) => {
                  const ss = l[n].variantes[vi].series, u = ss[ss.length - 1];
                  const ns: Serie = { t: "S", kg: u ? u.kg : 0, reps: u ? u.reps : 12 };
                  if (l[n].variantes[vi].biset) { ns.kg2 = u ? u.kg2 || 0 : 0; ns.reps2 = u ? u.reps2 || 0 : 12; }
                  ss.push(ns);
                }, true)}>+ série</button></div>
              </div>
            ))}
            <div className="row"><button className="btn small ghost" type="button" onClick={() => mudar((l) => {
              const vs = l[n].variantes;
              vs.push({ nome: "Opção " + (vs.length + 1), series: clone(vs[0].series) });
              if (vs.length === 2 && !vs[0].nome) vs[0].nome = "Opção 1";
            }, true)}>+ variação (ex.: outra opção de abdominal)</button></div>
          </article>
        ))}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn fill" type="button" onClick={() => mudar((l) => {
          l.push({ id: "ex-" + uid(), nome: "Novo exercício", garmin: "", ajuste: "", variantes: [{ nome: "", series: [{ t: "S", kg: 10, reps: 12 }, { t: "S", kg: 10, reps: 12 }, { t: "S", kg: 10, reps: 12 }] }] });
        }, true)}>+ Adicionar exercício</button>
      </div>
    </>
  );
}
