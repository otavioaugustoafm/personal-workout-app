// Histórico → Sono: sono, HRV, Body Battery, FC de repouso e a nota de prontidão ao longo do tempo.
import { addDays, ddmm, fmtDateLong, isoToday } from "../lib/dominio";
import { corFaixa, fmtHoras, type DiaSaude } from "../lib/saude";
import { useStore } from "../lib/storeContext";
import { GraficoBarras, GraficoLinha } from "./Graficos";
import { AnaliseIA } from "./IA";

const media = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const f0 = (n: number | null) => (n == null ? "—" : String(Math.round(n)));

export default function SonoHist() {
  const { S } = useStore();
  const hoje = isoToday();
  const dias = (S.saude || []).filter((d) => d.data >= addDays(hoje, -30));
  if (!dias.length) {
    return <div className="empty">Ainda sem dados de sono. Eles chegam do Garmin na sincronização (de hora em hora, ou pelo botão Sincronizar agora em Hoje).</div>;
  }
  const ult7 = dias.filter((d) => d.data > addDays(hoje, -7)), ant = dias.filter((d) => d.data <= addDays(hoje, -7));
  const sono7 = media(ult7.map((d) => d.sono?.seg)), sonoAnt = media(ant.map((d) => d.sono?.seg));
  const hrv7 = media(ult7.map((d) => d.hrv?.noite)), faixa = [...dias].reverse().find((d) => d.hrv?.faixa_min)?.hrv;
  const fc7 = media(ult7.map((d) => d.resumo?.fc_repouso)), fcAnt = media(ant.map((d) => d.resumo?.fc_repouso));
  const bb7 = media(ult7.map((d) => d.resumo?.bb_max)), pr7 = media(ult7.map((d) => d.prontidao?.nota));
  const pts = (f: (d: DiaSaude) => number | null | undefined, tip: (d: DiaSaude, v: number) => string) =>
    dias.flatMap((d) => { const v = f(d); return typeof v === "number" ? [{ label: ddmm(d.data), y: v, tip: `${fmtDateLong(d.data)}\n${tip(d, v)}` }] : []; });
  return (
    <>
      <div className="tiles">
        <div className="tile"><div className="v" style={pr7 != null ? { color: corFaixa(pr7) } : undefined}>{f0(pr7)}</div><div className="l">prontidão média (7 dias)</div></div>
        <div className="tile"><div className="v">{sono7 ? fmtHoras(sono7) : "—"}</div><div className="l">sono médio (7 dias){sonoAnt ? ` · antes ${fmtHoras(sonoAnt)}` : ""}</div></div>
        <div className="tile"><div className="v">{f0(hrv7)}<small style={{ fontSize: ".45em", opacity: .6, marginLeft: 4 }}>ms</small></div><div className="l">HRV médio (7 dias){faixa?.faixa_min ? ` · sua faixa ${faixa.faixa_min}–${faixa.faixa_max}` : ""}</div></div>
        <div className="tile"><div className="v">{f0(fc7)}<small style={{ fontSize: ".45em", opacity: .6, marginLeft: 4 }}>bpm</small></div><div className="l">FC de repouso (7 dias){fcAnt ? ` · antes ${f0(fcAnt)}` : ""}</div></div>
        <div className="tile"><div className="v">{f0(bb7)}</div><div className="l">Body Battery máxima (7 dias)</div></div>
      </div>
      <AnaliseIA tipo="sono" chave={hoje} titulo="Sono e recuperação" vazio="Toque em Gerar análise para cruzar 8 semanas de sono, HRV e Body Battery com os seus treinos (Sonnet 5.5, ~US$ 0,05)." />
      <div className="charts2">
        <div className="chart"><h3>Prontidão</h3><div className="cap">Nota de 0 a 100 por dia (30 dias).</div>
          <GraficoLinha pts={pts((d) => d.prontidao?.nota, (_, v) => `Prontidão ${v}`)} unidade="" fmt={(n) => String(Math.round(n))} /></div>
        <div className="chart"><h3>Sono por noite</h3><div className="cap">Horas dormidas.</div>
          <GraficoBarras pts={pts((d) => (d.sono ? d.sono.seg / 3600 : null), (d) => `Sono ${fmtHoras(d.sono!.seg)}${d.sono!.nota != null ? ` · nota ${d.sono!.nota}` : ""}\nProfundo ${fmtHoras(d.sono!.profundo)} · REM ${fmtHoras(d.sono!.rem)}`)} fmt={(n) => n.toFixed(1).replace(".", ",")} /></div>
        <div className="chart"><h3>HRV da noite</h3><div className="cap">Em ms.{faixa?.faixa_min ? ` Sua faixa normal: ${faixa.faixa_min}–${faixa.faixa_max}.` : ""}</div>
          <GraficoLinha pts={pts((d) => d.hrv?.noite, (d, v) => `HRV ${v} ms${d.hrv?.status ? " · " + d.hrv.status.toLowerCase() : ""}`)} unidade="ms" fmt={(n) => String(Math.round(n))} /></div>
        <div className="chart"><h3>FC de repouso</h3><div className="cap">Em bpm; subir alguns batimentos costuma indicar cansaço.</div>
          <GraficoLinha pts={pts((d) => d.resumo?.fc_repouso, (_, v) => `FC de repouso ${v} bpm`)} unidade="bpm" fmt={(n) => String(Math.round(n))} /></div>
        <div className="chart"><h3>Body Battery</h3><div className="cap">O máximo de cada dia (normalmente ao acordar).</div>
          <GraficoBarras pts={pts((d) => d.resumo?.bb_max, (d, v) => `Máxima ${v}${d.resumo?.bb_carregou != null ? ` · carregou ${d.resumo.bb_carregou}, gastou ${d.resumo.bb_gastou}` : ""}`)} fmt={(n) => String(Math.round(n))} /></div>
      </div>
      <div className="chart"><h3>Noites</h3><div className="tbl-wrap"><table className="data">
        <thead><tr><th>Dia</th><th>Prontidão</th><th>Sono</th><th>Nota</th><th>Profundo</th><th>REM</th><th>HRV</th><th>FC repouso</th><th>Body Battery</th><th>Estresse</th></tr></thead>
        <tbody>{[...dias].reverse().slice(0, 21).map((d) => (
          <tr key={d.data}>
            <td>{fmtDateLong(d.data)}</td>
            <td className="mono" style={d.prontidao ? { color: corFaixa(d.prontidao.nota) } : undefined}>{d.prontidao?.nota ?? "—"}</td>
            <td className="mono">{fmtHoras(d.sono?.seg)}</td><td className="mono">{d.sono?.nota ?? "—"}</td>
            <td className="mono">{fmtHoras(d.sono?.profundo)}</td><td className="mono">{fmtHoras(d.sono?.rem)}</td>
            <td className="mono">{d.hrv?.noite ?? "—"}</td><td className="mono">{d.resumo?.fc_repouso ?? "—"}</td>
            <td className="mono">{d.resumo?.bb_max ?? "—"}</td><td className="mono">{d.resumo?.estresse ?? "—"}</td>
          </tr>
        ))}</tbody>
      </table></div></div>
    </>
  );
}
