// Recomendação da semana: parte da semana padrão e reorganiza os dias restantes quando você falta ou troca.
//
// Regras (as mesmas combinadas na página original):
// - Perna, Peito, Costas e Longão são recuperados se você faltar; Corrida de qualidade, Bike e Ombro só caem.
// - Nada de cardio no dia seguinte à perna; nada de duas corridas seguidas; corrida forte longe da perna.
// - O fim de semana nunca atrapalha a segunda e a terça seguintes (que voltam ao padrão).
import { addDays, DIAS, dow, isoToday, ITEMS, mondayOf, slotOf, type Estado, type ItemId, type Sessao } from "./dominio";

const VALUE: Record<string, number> = { D: 100, A: 80, B: 80, LONG: 70, RUN: 30, BIKE: 25, C: 20 };
const RECUPERA = new Set(["D", "A", "B", "LONG"]);

export function mainItem(list: Sessao[]): ItemId | null {
  if (!list.length) return null;
  const d = list.find((s) => slotOf(s.item) === "D");
  return (d || list.find((s) => s.item !== "OFF") || list[0]).item;
}

/** Penalidade de fazer y no dia seguinte a x. */
function stepPen(x: ItemId | null, y: ItemId | null): number {
  if (!x || !y || x === "OFF" || y === "OFF") return 0;
  const a = ITEMS[x], b = ITEMS[y], sx = a.slot, sy = b.slot;
  let p = 0;
  if (sx === "D" && b.kind === "cardio") return -1000; // nada de cardio no dia seguinte à perna
  if (sx === sy) p -= 30; // mesmo grupo em dias seguidos
  if (a.kind === "cardio" && sy === "D") p -= sx === "LONG" ? 15 : 8; // perna com as pernas cansadas
  if (a.mod === "corrida" && b.mod === "corrida") p -= 40; // duas corridas seguidas: impacto no joelho
  else if (a.kind === "cardio" && b.kind === "cardio") p -= 1;
  if (a.kind === "forca" && b.kind === "forca" && sx !== "D" && sy !== "D") p -= 3;
  if (x === "BI" && sy === "LONG") p -= 5;
  return p;
}
const pen2 = (p2: ItemId | null, it: ItemId | null) => (slotOf(p2) === "D" && (slotOf(it) === "LONG" || it === "RQ") ? -25 : 0);

function solve(days: number[], pending: ItemId[], prevItem: ItemId | null, padrao: ItemId[], prevItem2: ItemId | null): ItemId[] {
  let best: ItemId[] = [], bestScore = -Infinity;
  const n = days.length, used = pending.map(() => false), cur: ItemId[] = [];
  const dfs = (k: number, score: number, prev: ItemId | null, prev2: ItemId | null) => {
    if (k === n) {
      const tail = n && days[n - 1] === 6 ? stepPen(prev, padrao[0]) + pen2(prev2, padrao[0]) + pen2(prev, padrao[1]) : 0;
      if (score + tail > bestScore) { bestScore = score + tail; best = cur.slice(); }
      return;
    }
    const day = days[k], tried = new Set<ItemId>();
    for (let j = 0; j < pending.length; j++) {
      if (used[j]) continue;
      const it = pending[j];
      if (tried.has(it)) continue;
      tried.add(it);
      used[j] = true; cur.push(it);
      const sl = slotOf(it)!;
      const sc = VALUE[sl] + (padrao[day] === it ? 12 : 0) + stepPen(prev, it) + pen2(prev2, it) + (sl === "LONG" && day < 5 ? -5 : 0);
      dfs(k + 1, score + sc, it, prev);
      cur.pop(); used[j] = false;
    }
    cur.push("OFF"); dfs(k + 1, score, "OFF", prev); cur.pop();
  };
  dfs(0, 0, prevItem, prevItem2);
  return best;
}

export interface Semana {
  dates: string[];
  ti: number;
  byDay: Sessao[][];
  rec: (ItemId | undefined)[];
  r0: number;
  deviated: boolean;
  dropped: ItemId[];
  padrao: ItemId[];
  alerts: string[];
  pre: boolean[];
}

export function weekInfo(S: Estado, today = isoToday()): Semana {
  const mon = mondayOf(today);
  const dates = [...Array(7)].map((_, i) => addDays(mon, i)), ti = dow(today);
  const byDay = dates.map((d) => S.sessoes.filter((s) => s.data === d));
  const padrao = S.padrao;
  const r0 = byDay[ti].length ? ti + 1 : ti;
  const pre = dates.map((d, i) => i < r0 && d < S.inicio && !byDay[i].length);
  const cov: Record<string, number> = {};
  byDay.forEach((a) => a.forEach((s) => { const sl = slotOf(s.item); if (sl) cov[sl] = (cov[sl] || 0) + 1; }));
  pre.forEach((p, i) => { const sl = slotOf(padrao[i]); if (p && sl) cov[sl] = (cov[sl] || 0) + 1; });
  const pending: ItemId[] = [];
  padrao.forEach((it, i) => {
    const sl = slotOf(it);
    if (!sl) return;
    if (cov[sl] > 0) { cov[sl]--; return; }
    if (i < r0 && !RECUPERA.has(sl) && !byDay[i].length) return; // faltou: só cai. Se trocou por outro treino, ainda pode entrar
    pending.push(it);
  });
  let deviated = false;
  for (let i = 0; i < r0; i++) {
    if (pre[i]) continue;
    const sl = slotOf(padrao[i]);
    const did = byDay[i].map((s) => slotOf(s.item));
    if (sl ? !did.includes(sl) : did.some(Boolean)) deviated = true;
  }
  const days: number[] = [];
  for (let i = r0; i < 7; i++) days.push(i);
  const stdRest = days.map((i) => padrao[i]).filter((it) => slotOf(it)).map(slotOf).sort().join();
  const pendSlots = pending.map(slotOf).sort().join();
  const rec: (ItemId | undefined)[] = [];
  if (!deviated && stdRest === pendSlots) {
    days.forEach((i) => (rec[i] = padrao[i]));
  } else {
    deviated = true;
    const prevList = r0 > 0 ? byDay[r0 - 1] : S.sessoes.filter((s) => s.data === addDays(mon, -1));
    const prev2List = r0 > 1 ? byDay[r0 - 2] : S.sessoes.filter((s) => s.data === addDays(mon, r0 - 2));
    const best = solve(days, pending, mainItem(prevList), padrao, mainItem(prev2List));
    days.forEach((d, k) => (rec[d] = best[k]));
  }
  const pc = rec.filter(Boolean) as ItemId[];
  const dropped: ItemId[] = [];
  pending.forEach((it) => { const j = pc.indexOf(it); if (j >= 0) pc.splice(j, 1); else dropped.push(it); });
  const seq = dates.map((_, i) => (byDay[i].length ? byDay[i].map((s) => s.item) : rec[i] ? [rec[i]!] : []));
  const alerts = dates.map((_, i) => {
    const prev = i > 0 ? seq[i - 1] : S.sessoes.filter((s) => s.data === addDays(mon, -1)).map((s) => s.item);
    if (prev.some((x) => slotOf(x) === "D") && seq[i].some((x) => ITEMS[x].kind === "cardio")) return "Cardio no dia seguinte à perna";
    if (seq[i].some((x) => slotOf(x) === "D") && seq[i].some((x) => ITEMS[x].kind === "cardio")) return "Cardio no mesmo dia da perna";
    return "";
  });
  return { dates, ti, byDay, rec, r0, deviated, dropped, padrao, alerts, pre };
}

export type EstadoDia = "done" | "pre" | "miss" | "today" | "adj" | "next";
export function dayState(w: Semana, i: number): { st: EstadoDia; it: ItemId; label: string } {
  const done = w.byDay[i], std = w.padrao[i];
  if (done.length) return { st: "done", it: mainItem(done)!, label: "feito" };
  if (i < w.ti) return w.pre[i] ? { st: "pre", it: std, label: "antes" } : { st: "miss", it: std, label: "faltou" };
  const it = w.rec[i] || "OFF";
  if (i === w.ti) return { st: "today", it, label: "hoje" };
  return { st: it !== std ? "adj" : "next", it, label: it !== std ? "ajustado" : "" };
}

/** Dia que passou sem registro e sem resposta: o app pergunta se você treinou. */
export function diaSemResposta(S: Estado, w: Semana): number {
  for (let i = w.ti - 1; i >= 0; i--) {
    if (!w.pre[i] && !w.byDay[i].length && !S.respondidos[w.dates[i]] && w.padrao[i] !== "OFF") return i;
  }
  return -1;
}

export function treinoDeHoje(S: Estado): ItemId {
  const w = weekInfo(S);
  const done = w.byDay[w.ti];
  return done.length ? mainItem(done)! : w.rec[w.ti] || "OFF";
}

export function fichaDoDia(S: Estado): { k: ItemId; hoje: boolean; dia: string } | null {
  const w = weekInfo(S);
  for (let i = w.ti; i < 7; i++) {
    const it = w.byDay[i].length && i === w.ti ? mainItem(w.byDay[i]) : w.rec[i];
    if (it && ITEMS[it].kind === "forca") return { k: it, hoje: i === w.ti, dia: DIAS[i] };
  }
  return null;
}

function pairPen(x: ItemId, y: ItemId): number {
  if (!x || !y || x === "OFF" || y === "OFF") return 0;
  const a = ITEMS[x], b = ITEMS[y];
  return a.slot === "D" && b.kind === "cardio" ? -1000 : 0;
}

export function checkPadrao(p: ItemId[]): { lvl: "bad" | "warn" | "info"; txt: string }[] {
  const out: { lvl: "bad" | "warn" | "info"; txt: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const a = p[i], b = p[(i + 1) % 7];
    if (pairPen(a, b) <= -1000) out.push({ lvl: "bad", txt: `${DIAS[(i + 1) % 7]}: ${ITEMS[b].nome.toLowerCase()} no dia seguinte à perna.` });
    else if (slotOf(a) === "LONG" && slotOf(b) === "D") out.push({ lvl: "warn", txt: `${DIAS[(i + 1) % 7]}: perna logo depois do longão, as pernas chegam cansadas.` });
    else if (ITEMS[a].kind === "cardio" && slotOf(b) === "D") out.push({ lvl: "warn", txt: `${DIAS[(i + 1) % 7]}: perna logo depois de cardio.` });
  }
  const slots = p.map(slotOf);
  if (!slots.includes("D")) out.push({ lvl: "warn", txt: "Sem dia de perna: a força de quadríceps e glúteo é o que mais protege o joelho na corrida." });
  if (slots.filter((s) => s === "D").length > 1) out.push({ lvl: "warn", txt: "Mais de um dia de perna na semana." });
  const seen: Record<string, number> = {};
  slots.forEach((s) => { if (s) seen[s] = (seen[s] || 0) + 1; });
  if (Object.values(seen).some((v) => v > 1) && !out.length)
    out.push({ lvl: "info", txt: "Algum treino aparece duas vezes. Se faltar um dia, o app tenta encaixar só uma vez cada." });
  return out;
}
