// Regras do treino do dia: rascunho, cargas sugeridas, volume, dores e o registro final.
import {
  DORES, fmtDist, fmtDur, fmtKg, fmtRitmo, isoToday, ITEMS, NIVEL, parseDur,
  type Estado, type Exercicio, type ExercicioSessao, type ItemId, type Nivel, type Rascunho, type Serie, type Sessao,
} from "./dominio";

/** Exercício conta para carga/volume só se foi anotado (não pulado, não aguardando o Garmin, não deixado sem nota). */
export const exValido = (e: ExercicioSessao) => !e.pulado && !e.aConfirmar && !e.semNota;

export const sessoesDesc = (S: Estado) =>
  S.sessoes.slice().sort((a, b) => b.data.localeCompare(a.data) || (b.ts || 0) - (a.ts || 0));

export function volume(s: Sessao): number {
  return (s.exercicios || []).filter(exValido).reduce(
    (a, e) => a + e.series.filter((x) => x.t === "S").reduce((b, x) => b + (x.kg || 0) * (x.reps || 0) + (x.kg2 || 0) * (x.reps2 || 0), 0),
    0,
  );
}

export function lastFor(S: Estado, exId: string, vi: number): { data: string; series: Serie[] } | null {
  for (const s of sessoesDesc(S)) {
    if (s.kind !== "forca") continue;
    const e = (s.exercicios || []).find((x) => x.id === exId && (x.variante || 0) === (vi || 0) && exValido(x));
    if (e) return { data: s.data, series: e.series };
  }
  return null;
}

/** Séries sugeridas: as da última vez que você fez o exercício, ou as da ficha. */
export function seriesFrom(S: Estado, ex: Exercicio, vi: number): Serie[] {
  const v = ex.variantes[vi] || ex.variantes[0];
  const last = lastFor(S, ex.id, vi);
  return v.series.map((b, i) => {
    const l = last && last.series[i] && last.series[i].t === b.t ? last.series[i] : null;
    const o: Serie = { t: b.t, kg: l ? l.kg : b.kg, reps: l ? l.reps : b.reps, feito: false };
    if (v.biset) {
      o.kg2 = l && l.kg2 != null ? l.kg2 : b.kg2 || 0;
      o.reps2 = l && l.reps2 != null ? l.reps2 : b.reps2 || 0;
    }
    return o;
  });
}

export function novoRascunho(S: Estado, item: ItemId, data?: string): Rascunho {
  const d: Rascunho = { item, data: data || isoToday(), ex: {}, dores: {}, sensacao: "", notas: "", dist: null, dur: "", fc: null };
  if (ITEMS[item].kind === "forca") S.fichas[item as "A"].forEach((e) => (d.ex[e.id] = { variante: 0, series: seriesFrom(S, e, 0) }));
  return d;
}

/** Garante que o rascunho acompanha a ficha (exercício novo, variação removida...). Devolve uma cópia. */
export function rascunhoAtual(S: Estado, item: ItemId): Rascunho {
  const base = S.rascunhos[item];
  const d: Rascunho = base ? JSON.parse(JSON.stringify(base)) : novoRascunho(S, item);
  d.dores = d.dores || {};
  if (ITEMS[item].kind === "forca") {
    S.fichas[item as "A"].forEach((e) => {
      const de = d.ex[e.id];
      if (!de || !e.variantes[de.variante || 0]) d.ex[e.id] = { variante: 0, series: seriesFrom(S, e, 0) };
    });
  }
  return d;
}

export const kindLabel = (t: string, i: number, list: Serie[]) =>
  t === "F" ? "Feeder " + list.slice(0, i + 1).filter((x) => x.t === "F").length
  : t === "A" ? "Aquec."
  : list.slice(0, i + 1).filter((x) => x.t === "S").length + "ª série";

export const seriesText = (series: Serie[]) =>
  series.map((s) =>
    s.reps2 != null
      ? `${s.reps}${s.kg ? ` (${fmtKg(s.kg)} kg)` : ""} + ${s.reps2}${s.kg2 ? ` (${fmtKg(s.kg2)} kg)` : ""}`
      : (s.t === "F" ? "F " : s.t === "A" ? "Aq " : "") + fmtKg(s.kg) + "×" + s.reps,
  ).join(" · ");

export function cardioLine(s: Sessao): string {
  const c = s.cardio;
  if (!c || (!c.dist && !c.dur_s)) return "";
  const mod = ITEMS[s.item].mod, parts: string[] = [];
  if (c.dist) parts.push(fmtDist(c.dist, mod));
  if (c.dur_s) parts.push(fmtDur(c.dur_s));
  if (c.dist && c.dur_s) parts.push(fmtRitmo(c.dist, c.dur_s, mod));
  if (c.fc) parts.push(c.fc + " bpm");
  const g = (s.garmin || {}) as { cadencia?: number | null; te_aerobico?: number | null };
  if (g.cadencia) parts.push(`${g.cadencia} ${mod === "corrida" ? "ppm" : "rpm"}`);
  if (g.te_aerobico) parts.push(`efeito ${fmtKg(g.te_aerobico)}`);
  return parts.join(" · ");
}

export function calcCardio(mod: string | undefined, d: Rascunho): string | null {
  const dur = parseDur(d.dur), dist = d.dist;
  if (!dur || !dist) return null;
  return fmtRitmo(dist, dur, mod as never);
}

// ---------- dores ----------
/** A articulação principal depende do treino: joelho em perna, corrida e bike; ombro na natação; cotovelo nos treinos de cima. */
export function dorPrincipal(item: ItemId): string | null {
  const it = ITEMS[item];
  if (it.mod === "natacao") return "ombro";
  if (it.kind === "cardio" || it.slot === "D") return "joelho";
  if (it.kind === "forca") return "cotovelo";
  return null;
}
export const doresAtivas = (s: Sessao) => Object.entries(s.dores || {}).filter(([, v]) => v === "leve" || v === "dor") as [string, Nivel][];
export const temDor = (s: Sessao, k: string) => s.dores?.[k] === "leve" || s.dores?.[k] === "dor";
export function doresTexto(s: Sessao, comOk: boolean): string {
  const main = dorPrincipal(s.item);
  const ativas = doresAtivas(s).map(([k, v]) => `${DORES[k] || k} ${NIVEL[v]}`);
  if (ativas.length) return ativas.join(", ");
  return comOk && main && s.dores?.[main] === "ok" ? `${DORES[main]} sem dor` : "";
}

/** Exercícios sem nenhuma série marcada e sem decisão (pulado / fiz o sugerido / Garmin). */
export function exPendentes(S: Estado, d: Rascunho): Exercicio[] {
  return S.fichas[d.item as "A"].filter((e) => {
    const de = d.ex[e.id];
    return !de.status && !de.series.some((s) => s.feito);
  });
}

/** Transforma o rascunho no registro que vai para o banco. */
export function montarSessao(S: Estado, d: Rascunho, id: string): Omit<Sessao, "ts"> & { ts: number } {
  const it = ITEMS[d.item];
  const dores: Record<string, Nivel> = {};
  Object.entries(d.dores || {}).forEach(([k, v]) => { if (v) dores[k] = v as Nivel; });
  const s: Sessao = {
    id, ts: Date.now(), data: d.data || isoToday(), item: d.item, kind: it.kind, dores,
    sensacao: (d.sensacao || null) as Sessao["sensacao"], notas: (d.notas || "").trim(), garmin: null,
  };
  if (it.kind === "cardio") s.cardio = { dist: d.dist ?? null, dur_s: parseDur(d.dur), fc: d.fc ?? null };
  if (it.kind === "forca") {
    s.exercicios = S.fichas[d.item as "A"].map((ex) => {
      const de = d.ex[ex.id], vi = de.variante || 0, st = de.status;
      const flags = st === "pulado" ? { pulado: true } : st === "gar" ? (ex.manual ? { semNota: true } : { aConfirmar: true }) : {};
      return {
        ...flags,
        id: ex.id, nome: ex.nome, garmin: ex.manual ? "" : ex.garmin || "", manual: !!ex.manual, variante: vi,
        varNome: ex.variantes.length > 1 ? ex.variantes[vi].nome || "Opção " + (vi + 1) : "",
        biset: ex.variantes[vi].biset || null,
        series: st === "pulado" ? [] : de.series.map((x) => {
          const o: Serie = { t: x.t, kg: +x.kg || 0, reps: +x.reps || 0, feito: st === "sug" ? true : !!x.feito };
          if (x.reps2 != null) { o.kg2 = +(x.kg2 || 0); o.reps2 = +(x.reps2 || 0); }
          return o;
        }),
      };
    });
  }
  return s;
}
