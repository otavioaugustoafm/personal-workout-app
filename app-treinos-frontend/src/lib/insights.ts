// Comparações por exercício (recordes, vez anterior, 1RM estimado), calculadas no próprio app.
import type { Estado, ExercicioSessao, Sessao } from "./dominio";
import { exValido } from "./treino";


const crono = (S: Estado) => S.sessoes.slice().sort((a, b) => a.data.localeCompare(b.data) || (a.ts || 0) - (b.ts || 0));
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

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

