// Insights calculados no próprio app, a partir das suas sessões. Nada sai do navegador.
import {
  addDays, DORES, fmtDist, fmtInt, fmtKg, fmtPace, isoToday, ITEMS, mondayOf,
  type Estado, type ExercicioSessao, type ItemId, type Modalidade, type Sessao,
} from "./dominio";
import { exValido, volume } from "./treino";

export type Tom = "bom" | "atencao" | "info";
export interface Insight { tom: Tom; titulo: string; texto: string }

const crono = (S: Estado) => S.sessoes.slice().sort((a, b) => a.data.localeCompare(b.data) || (a.ts || 0) - (b.ts || 0));
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// ---------------------------------------------------------------- por exercício

/** Séries de trabalho (sem feeder e aquecimento). */
const trabalho = (e: ExercicioSessao) => e.series.filter((x) => x.t === "S");
/** 1RM estimado (Epley) da melhor série. Só faz sentido até ~12 reps. */
export const rm1 = (kg: number, reps: number) => (kg > 0 && reps > 0 ? kg * (1 + Math.min(reps, 12) / 30) : 0);

export interface Marca { data: string; sid: string; top: number; repsTop: number; vol: number; rm: number }

/** Histórico de um exercício (mesma variação), em ordem de data. */
export function marcasDo(S: Estado, exId: string, variante: number): Marca[] {
  return crono(S).flatMap((s) => (s.exercicios || [])
    .filter((e) => e.id === exId && exValido(e) && (e.variante || 0) === variante)
    .flatMap((e) => {
      const t = trabalho(e);
      if (!t.length) return [];
      const top = Math.max(...t.map((x) => x.kg || 0));
      const repsTop = t.filter((x) => x.kg === top).reduce((a, x) => Math.max(a, x.reps || 0), 0);
      return [{
        data: s.data, sid: s.id, top, repsTop,
        vol: t.reduce((a, x) => a + (x.kg || 0) * (x.reps || 0) + (x.kg2 || 0) * (x.reps2 || 0), 0),
        rm: Math.max(0, ...t.map((x) => rm1(x.kg || 0, x.reps || 0))),
      }];
    }));
}

/** Comparação de um exercício de uma sessão com a vez anterior. */
export function comparaExercicio(S: Estado, s: Sessao, e: ExercicioSessao) {
  const ms = marcasDo(S, e.id, e.variante || 0);
  const i = ms.findIndex((m) => m.sid === s.id);
  if (i < 0) return null;
  const atual = ms[i], ant = i > 0 ? ms[i - 1] : null;
  const recordeAntes = Math.max(0, ...ms.slice(0, i).map((m) => m.top));
  return {
    atual, ant,
    recorde: i > 0 && atual.top > 0 && atual.top > recordeAntes,
    dTop: ant ? atual.top - ant.top : null,
    dVol: ant ? pct(atual.vol, ant.vol) : null,
  };
}

// ---------------------------------------------------------------- treino aberto

export function insightsDoTreino(S: Estado, s: Sessao): Insight[] {
  const out: Insight[] = [];
  if (s.kind === "forca") {
    const ex = (s.exercicios || []).filter(exValido);
    const comp = ex.map((e) => ({ e, c: comparaExercicio(S, s, e) }));
    const recs = comp.filter((x) => x.c?.recorde);
    if (recs.length) out.push({ tom: "bom", titulo: `${recs.length} recorde${recs.length > 1 ? "s" : ""} de carga`, texto: recs.map((x) => `${x.e.nome} (${fmtKg(x.c!.atual.top)} kg)`).join(", ") + "." });
    const subiu = comp.filter((x) => !x.c?.recorde && (x.c?.dTop || 0) > 0), caiu = comp.filter((x) => (x.c?.dTop || 0) < 0);
    if (subiu.length) out.push({ tom: "bom", titulo: "Carga subiu", texto: subiu.map((x) => `${x.e.nome} +${fmtKg(x.c!.dTop!)} kg`).join(", ") + " em relação à vez anterior." });
    if (caiu.length) out.push({ tom: "info", titulo: "Carga menor que a vez anterior", texto: caiu.map((x) => `${x.e.nome} ${fmtKg(x.c!.dTop!)} kg`).join(", ") + ". Normal em dia cansado; se repetir, vale olhar sono e recuperação." });
    const ant = crono(S).filter((x) => x.item === s.item && x.kind === "forca" && !x.rapido && (x.data < s.data || (x.data === s.data && x.ts < s.ts))).pop();
    const dv = ant ? pct(volume(s), volume(ant)) : null;
    if (dv !== null && Math.abs(dv) >= 5) out.push({ tom: dv > 0 ? "bom" : "info", titulo: `Volume ${dv > 0 ? "+" : ""}${dv}%`, texto: `Comparado ao último ${ITEMS[s.item].nome} (${fmtInt(volume(ant!))} kg).` });
    const pulados = (s.exercicios || []).filter((e) => e.pulado).map((e) => e.nome);
    if (pulados.length) out.push({ tom: "info", titulo: `${pulados.length} exercício${pulados.length > 1 ? "s" : ""} pulado${pulados.length > 1 ? "s" : ""}`, texto: pulados.join(", ") + "." });
  } else if (s.cardio?.dist && s.cardio?.dur_s) {
    const mod = ITEMS[s.item].mod as Modalidade;
    const iguais = crono(S).filter((x) => x.item === s.item && x.id !== s.id && x.cardio?.dist && x.cardio?.dur_s && x.data <= s.data).slice(-5);
    if (iguais.length >= 2) {
      const vel = (x: Sessao) => x.cardio!.dist! / x.cardio!.dur_s!;
      const dVel = pct(vel(s), media(iguais.map(vel)));
      if (dVel !== null && Math.abs(dVel) >= 3) {
        const rapido = dVel > 0;
        out.push({ tom: rapido ? "bom" : "info", titulo: rapido ? "Mais rápido que o normal" : "Mais lento que o normal",
          texto: `${Math.abs(dVel)}% em relação à média dos últimos ${iguais.length} treinos de ${ITEMS[s.item].nome}.` });
      }
      const fcs = iguais.filter((x) => x.cardio?.fc);
      if (s.cardio.fc && fcs.length >= 2) {
        const ef = (x: Sessao) => vel(x) / x.cardio!.fc!;
        const dEf = pct(ef(s), media(fcs.map(ef)));
        if (dEf !== null && Math.abs(dEf) >= 3) out.push({ tom: dEf > 0 ? "bom" : "info", titulo: dEf > 0 ? "Mais eficiente" : "Menos eficiente",
          texto: `Velocidade por batimento ${dEf > 0 ? "+" : ""}${dEf}% vs a média: ${dEf > 0 ? "mesmo esforço rendendo mais" : "pode ser calor, cansaço ou o ritmo do dia"}.` });
      }
    }
    const maior = Math.max(0, ...crono(S).filter((x) => ITEMS[x.item].mod === mod && x.id !== s.id && x.data <= s.data).map((x) => x.cardio?.dist || 0));
    if (maior > 0 && s.cardio.dist > maior) out.push({ tom: "bom", titulo: "Maior distância", texto: `Recorde em ${ITEMS[s.item].nome === "Longão" ? "corrida" : ITEMS[s.item].nome.toLowerCase()}: ${fmtDist(s.cardio.dist, mod)}.` });
  }
  const g = (s.garmin || {}) as { te_aerobico?: number | null; te_anaerobico?: number | null };
  if (g.te_aerobico) {
    const te = g.te_aerobico;
    const nivel = te < 2 ? "recuperação" : te < 3 ? "manutenção da base" : te < 4 ? "melhora da base aeróbica" : te < 5 ? "melhora forte" : "sobrecarga";
    out.push({ tom: te >= 5 ? "atencao" : "info", titulo: `Efeito aeróbico ${fmtKg(te)}`, texto: `Pela escala do Garmin: ${nivel}.` });
  }
  return out;
}

// ---------------------------------------------------------------- aba Musculação

export function insightsMusculacao(S: Estado): Insight[] {
  const out: Insight[] = [];
  const hoje = isoToday(), d14 = addDays(hoje, -14), d56 = addDays(hoje, -56);
  const fichas = (["A", "B", "C", "D"] as const).flatMap((k) => S.fichas[k].map((e) => ({ k, e })));
  const recordes: string[] = [], parados: string[] = [], caindo: string[] = [];
  fichas.forEach(({ e }) => {
    e.variantes.forEach((_, vi) => {
      const ms = marcasDo(S, e.id, vi).filter((m) => m.top > 0);
      if (!ms.length) return;
      const nome = e.variantes.length > 1 ? `${e.nome} (${e.variantes[vi].nome || "opção " + (vi + 1)})` : e.nome;
      const ult = ms[ms.length - 1];
      if (ms.length >= 2 && ult.data >= d14 && ult.top > Math.max(...ms.slice(0, -1).map((m) => m.top))) recordes.push(`${nome} ${fmtKg(ult.top)} kg`);
      const ult4 = ms.slice(-4);
      if (ult4.length === 4 && ult4.every((m) => m.top === ult4[0].top) && ult4.every((m) => m.repsTop >= ult4[0].repsTop)) parados.push(`${nome} (${fmtKg(ult4[0].top)} kg)`);
      const ult3 = ms.slice(-3);
      if (ult3.length === 3 && ult3[2].top < ult3[1].top && ult3[1].top < ult3[0].top) caindo.push(nome);
    });
  });
  if (recordes.length) out.push({ tom: "bom", titulo: `${recordes.length} recorde${recordes.length > 1 ? "s" : ""} nas últimas 2 semanas`, texto: recordes.slice(0, 6).join(", ") + (recordes.length > 6 ? "…" : ".") });
  if (parados.length) out.push({ tom: "info", titulo: "Mesma carga há 4 treinos", texto: `${parados.slice(0, 5).join(", ")}. Se as repetições estão saindo com folga, dá para tentar subir um pouco a carga.` });
  if (caindo.length) out.push({ tom: "atencao", titulo: "Carga caindo há 3 treinos", texto: `${caindo.join(", ")}. Pode ser cansaço acumulado, dor ou troca de máquina: vale conferir.` });

  // volume por treino: últimas 3 sessões vs as 3 anteriores
  (["A", "B", "C", "D"] as ItemId[]).forEach((k) => {
    const ss = crono(S).filter((s) => s.item === k && s.kind === "forca" && !s.rapido && volume(s) > 0);
    if (ss.length < 4) return;
    const rec = ss.slice(-3), prev = ss.slice(-6, -3);
    const d = pct(media(rec.map(volume)), media(prev.map(volume)));
    if (d !== null && Math.abs(d) >= 10) out.push({ tom: d > 0 ? "bom" : "info", titulo: `${ITEMS[k].nome}: volume ${d > 0 ? "+" : ""}${d}%`, texto: `Média dos últimos ${rec.length} treinos vs os ${prev.length} anteriores.` });
  });

  // exercícios que você mais pula
  const pul: Record<string, number> = {};
  S.sessoes.filter((s) => s.data >= d56).forEach((s) => (s.exercicios || []).forEach((e) => { if (e.pulado) pul[e.nome] = (pul[e.nome] || 0) + 1; }));
  const muito = Object.entries(pul).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  if (muito.length) out.push({ tom: "info", titulo: "Mais pulados (8 semanas)", texto: muito.slice(0, 4).map(([n, c]) => `${n} ${c}×`).join(", ") + ". Se não faz mais sentido na ficha, dá para tirar no Plano." });

  const semNota = S.sessoes.filter((s) => s.data >= d56 && s.kind === "forca").flatMap((s) => (s.exercicios || []).filter((e) => e.semNota && !e.manual)).length;
  if (semNota >= 3) out.push({ tom: "info", titulo: `${semNota} exercícios sem anotação (8 semanas)`, texto: "Eles não entram nos gráficos. O Garmin completa o que o relógio registrou, quando você confirma em Hoje." });
  if (!out.length) out.push({ tom: "info", titulo: "Ainda pouco histórico", texto: "Os insights aparecem conforme você registra treinos: recordes, cargas paradas, quedas e exercícios pulados." });
  return out;
}

// ---------------------------------------------------------------- aba Cardio

export function insightsCardio(S: Estado, mod: Modalidade): Insight[] {
  const out: Insight[] = [];
  const todas = crono(S).filter((s) => s.kind === "cardio" && ITEMS[s.item].mod === mod);
  if (!todas.length) return out;
  const hoje = isoToday(), seg = mondayOf(hoje);
  const kmSemana = (ini: string) => todas.filter((s) => s.data >= ini && s.data <= addDays(ini, 6)).reduce((a, s) => a + (s.cardio?.dist || 0), 0);
  const passadas = [1, 2, 3, 4].map((k) => kmSemana(addDays(seg, -7 * k)));
  const mediaP = media(passadas.filter((x) => x > 0));
  const unid = (km: number) => fmtDist(km, mod);

  if (mod === "corrida") {
    const ult = passadas[0], ant = passadas[1];
    if (ult > 0 && ant > 0) {
      const d = pct(ult, ant)!;
      if (d > 10) out.push({ tom: "atencao", titulo: `Semana passada: +${d}% de quilometragem`, texto: `${unid(ult)} contra ${unid(ant)}. A regra clássica é subir até uns 10% por semana, principalmente cuidando do joelho.` });
      else out.push({ tom: "bom", titulo: "Progressão segura", texto: `Semana passada ${unid(ult)} (${d > 0 ? "+" : ""}${d}% vs a anterior), dentro dos ~10% por semana.` });
    }
    const longoes = todas.filter((s) => s.item === "LG" && s.cardio?.dist);
    if (longoes.length >= 2) {
      const a = longoes[longoes.length - 1].cardio!.dist!, b = longoes[longoes.length - 2].cardio!.dist!;
      out.push({ tom: "info", titulo: `Longão: ${unid(a)}`, texto: `O anterior foi ${unid(b)}. Maior até agora: ${unid(Math.max(...longoes.map((s) => s.cardio!.dist!)))}.` });
    }
  }
  if (mediaP > 0) {
    const atual = kmSemana(seg);
    out.push({ tom: "info", titulo: `Semana atual: ${unid(atual)}`, texto: `Média das últimas semanas com treino: ${unid(mediaP)}.` });
  }

  // ritmo e eficiência: últimos 3 vs 3 anteriores (com distância, tempo e FC)
  const comRitmo = todas.filter((s) => s.cardio?.dist && s.cardio?.dur_s && s.item !== "RQ");
  if (comRitmo.length >= 4) {
    const vel = (x: Sessao) => x.cardio!.dist! / x.cardio!.dur_s!;
    const rec = comRitmo.slice(-3), prev = comRitmo.slice(-6, -3);
    const dv = pct(media(rec.map(vel)), media(prev.map(vel)));
    if (dv !== null && Math.abs(dv) >= 2) {
      const txt = mod === "corrida" || mod === "natacao"
        ? `Pace médio ${fmtPace(1 / media(rec.map(vel)) * (mod === "natacao" ? 0.1 : 1))} vs ${fmtPace(1 / media(prev.map(vel)) * (mod === "natacao" ? 0.1 : 1))}${mod === "natacao" ? " /100 m" : " /km"}.`
        : `Velocidade média ${(media(rec.map(vel)) * 3600).toFixed(1).replace(".", ",")} vs ${(media(prev.map(vel)) * 3600).toFixed(1).replace(".", ",")} km/h.`;
      out.push({ tom: dv > 0 ? "bom" : "info", titulo: dv > 0 ? "Ficando mais rápido" : "Ritmo mais lento", texto: `${txt} Últimos 3 treinos (sem os de qualidade) vs os 3 anteriores.` });
    }
    const comFc = comRitmo.filter((s) => s.cardio?.fc);
    if (comFc.length >= 4) {
      const ef = (x: Sessao) => vel(x) / x.cardio!.fc!;
      const r = comFc.slice(-3), p = comFc.slice(-6, -3);
      const de = pct(media(r.map(ef)), media(p.map(ef)));
      if (de !== null && Math.abs(de) >= 3) out.push({ tom: de > 0 ? "bom" : "info", titulo: de > 0 ? "Base aeróbica melhorando" : "Eficiência aeróbica menor",
        texto: de > 0 ? `Mais velocidade para a mesma frequência cardíaca (+${de}%).` : `Menos velocidade por batimento (${de}%). Calor, sono ruim e cansaço costumam explicar.` });
    }
  }
  if (mod === "corrida" || mod === "bike") {
    const d28 = addDays(hoje, -28), joelho = todas.filter((s) => s.data >= d28 && (s.dores?.joelho === "leve" || s.dores?.joelho === "dor")).length;
    const total = todas.filter((s) => s.data >= d28).length;
    if (joelho) out.push({ tom: "atencao", titulo: `Joelho em ${joelho} de ${total} treinos (4 semanas)`, texto: "Se aparecer em treinos seguidos, reduza volume ou intensidade e veja se a perna está muito perto do cardio." });
    else if (total >= 3) out.push({ tom: "bom", titulo: "Joelho tranquilo", texto: `Sem incômodo nos ${total} treinos das últimas 4 semanas.` });
  }
  return out;
}

// ---------------------------------------------------------------- aba Semana (geral)

export function insightsGerais(S: Estado): Insight[] {
  const out: Insight[] = [];
  const hoje = isoToday(), seg = mondayOf(hoje);
  const reais = S.sessoes.filter((s) => s.item !== "OFF");
  const dias = new Set(reais.map((s) => s.data));

  // sequência de dias treinando (hoje conta se já treinou; senão conta até ontem)
  let seq = 0, d = dias.has(hoje) ? hoje : addDays(hoje, -1);
  while (dias.has(d)) { seq++; d = addDays(d, -1); }
  if (seq >= 3) out.push({ tom: "bom", titulo: `${seq} dias seguidos treinando`, texto: "Constância é o que mais conta." });

  // consistência das últimas 4 semanas completas
  const ini = addDays(seg, -28);
  const dias4 = [...dias].filter((x) => x >= ini && x < seg).length;
  if (dias4 && ini >= S.inicio) out.push({ tom: dias4 >= 22 ? "bom" : "info", titulo: `${dias4} de 28 dias treinados`, texto: "Nas últimas 4 semanas completas." });

  // treinos planejados que mais ficam de fora
  const desde = ini >= S.inicio ? ini : S.inicio;
  const falta: Record<string, number> = {};
  for (let x = desde; x < seg; x = addDays(x, 1)) {
    const plan = S.padrao[(new Date(x + "T12:00").getDay() + 6) % 7];
    if (plan && plan !== "OFF" && !reais.some((s) => s.data >= mondayOf(x) && s.data <= addDays(mondayOf(x), 6) && s.item === plan)) falta[plan] = (falta[plan] || 0) + 1;
  }
  const maisFalta = Object.entries(falta).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  if (maisFalta.length) out.push({ tom: "info", titulo: "O que mais fica de fora", texto: maisFalta.slice(0, 3).map(([k, n]) => `${ITEMS[k as ItemId].nome} em ${n} semana${n > 1 ? "s" : ""}`).join(", ") + "." });

  // dores recorrentes: articulação em 2+ das últimas 3 semanas, e em qual treino aparece mais
  const sem3 = [1, 2, 3].map((k) => addDays(seg, -7 * k));
  const juntas = new Set(reais.flatMap((s) => Object.keys(s.dores || {})));
  juntas.forEach((j) => {
    const nas = sem3.filter((w) => reais.some((s) => s.data >= w && s.data <= addDays(w, 6) && (s.dores?.[j] === "leve" || s.dores?.[j] === "dor"))).length;
    if (nas < 2) return;
    const porItem: Record<string, [number, number]> = {};
    reais.filter((s) => s.data >= sem3[2]).forEach((s) => {
      const c = porItem[s.item] || [0, 0];
      c[1]++;
      if (s.dores?.[j] === "leve" || s.dores?.[j] === "dor") c[0]++;
      porItem[s.item] = c;
    });
    const pior = Object.entries(porItem).filter(([, c]) => c[0] > 0).sort((a, b) => b[1][0] / b[1][1] - a[1][0] / a[1][1])[0];
    const doeu = reais.some((s) => s.data >= sem3[2] && s.dores?.[j] === "dor");
    out.push({ tom: doeu ? "atencao" : "info", titulo: `${DORES[j] || j}: ${nas} das últimas 3 semanas`,
      texto: (pior ? `Aparece mais em ${ITEMS[pior[0] as ItemId].nome} (${pior[1][0]} de ${pior[1][1]} treinos). ` : "") + (doeu ? "Chegou a doer: vale aliviar carga nesse treino ou procurar avaliação se continuar." : "Por enquanto só incômodo; fique de olho.") });
  });

  // regra do joelho: corrida ou bike no dia seguinte à perna
  const pernas = reais.filter((s) => s.item === "D" && s.data >= addDays(hoje, -56)).map((s) => s.data);
  const depois = pernas.filter((p) => reais.some((s) => s.data === addDays(p, 1) && ["corrida", "bike", "bikerua"].includes(ITEMS[s.item].mod || ""))).length;
  if (depois) out.push({ tom: "atencao", titulo: `Cardio logo depois da perna ${depois}×`, texto: "Nas últimas 8 semanas. É justamente o que a organização da semana tenta evitar por causa do joelho." });

  // volume da semana passada vs média
  const volSem = (w: string) => reais.filter((s) => s.kind === "forca" && s.data >= w && s.data <= addDays(w, 6)).reduce((a, s) => a + volume(s), 0);
  const vs = [1, 2, 3, 4, 5].map((k) => volSem(addDays(seg, -7 * k)));
  const base = media(vs.slice(1).filter((x) => x > 0));
  const dv = vs[0] > 0 ? pct(vs[0], base) : null;
  if (dv !== null && Math.abs(dv) >= 15) out.push({ tom: dv > 0 ? "bom" : "info", titulo: `Volume da semana passada ${dv > 0 ? "+" : ""}${dv}%`, texto: `${fmtInt(vs[0])} kg contra a média de ${fmtInt(base)} kg das semanas anteriores.` });
  if (!out.length) out.push({ tom: "info", titulo: "Ainda pouco histórico", texto: "Com algumas semanas registradas aparecem: sequência, consistência, dores recorrentes, o que mais fica de fora e a regra do joelho." });
  return out;
}
