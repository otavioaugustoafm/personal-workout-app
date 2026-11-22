// Fase 2: como o que veio do Garmin entra nas suas sessões.
// Regras (as suas): o que você anotou vale; o Garmin só completa o que ficou sem anotação, e você confirma.
import {
  clone, dow, uid,
  type Estado, type Exercicio, type ExercicioSessao, type ItemId, type Modalidade, type Serie, type Sessao,
} from "./dominio";
import { exValido } from "./treino";

export interface SerieGarmin { reps: number; kg: number }
export interface GrupoGarmin {
  passo: number | null;
  categoria: string;
  nome: string;        // nome da biblioteca do Garmin
  descricao: string;   // o que você escreve no passo do treino no Garmin Connect
  series: SerieGarmin[];
  pulado: boolean;
}
export interface ResumoGarmin {
  nome: string;
  dist_km: number | null;
  dur_s: number | null;
  fc: number | null;
  fc_max: number | null;
  calorias: number | null;
  te_aerobico: number | null;
  te_anaerobico: number | null;
  cadencia: number | null;
  elevacao_m: number | null;
  inicio: string;
}
export interface Volta { dist_m: number | null; seg: number; fc: number | null; fc_max: number | null; cadencia: number | null; subida: number | null; tipo: string }
export interface AtividadeGarmin {
  id: string;
  data: string;
  tipo: string;
  resumo: ResumoGarmin;
  exercicios: GrupoGarmin[] | null;
  voltas?: Volta[] | null;
}
export interface EstadoGarmin {
  atividades: AtividadeGarmin[];
  ultima_sync: string | null;
  ultimo_erro: string | null;
  chave_expira: string | null;
}
/** O que fica guardado na sessão sobre a atividade do Garmin (para o histórico). */
export interface ExtraGarmin {
  atividade: string;
  fc_max?: number | null;
  calorias?: number | null;
  te_aerobico?: number | null;
  te_anaerobico?: number | null;
  cadencia?: number | null;
  elevacao_m?: number | null;
  dur_s?: number | null;
  fc?: number | null;
  voltas?: Volta[] | null;
}

export const MOD_DO_TIPO: Record<string, Modalidade | "forca"> = {
  strength_training: "forca",
  running: "corrida", treadmill_running: "corrida", trail_running: "corrida", track_running: "corrida",
  indoor_cycling: "bike", virtual_ride: "bike",
  cycling: "bikerua", road_biking: "bikerua", mountain_biking: "bikerua", gravel_cycling: "bikerua",
  lap_swimming: "natacao", open_water_swimming: "natacao", swimming: "natacao",
};
export const NOME_DO_TIPO: Record<Modalidade | "forca", string> = {
  forca: "Musculação", corrida: "Corrida", bike: "Bike indoor", bikerua: "Bike de rua", natacao: "Natação",
};
export const ITENS_DA_MOD: Record<Modalidade | "forca", ItemId[]> = {
  forca: ["A", "B", "C", "D"], corrida: ["RQ", "RL", "LG"], bike: ["BK", "BI"], bikerua: ["BR"], natacao: ["NT"],
};
export const modDe = (a: AtividadeGarmin) => MOD_DO_TIPO[a.tipo] || null;

/** Pendentes que importam: só a partir do dia em que você começou a usar o app. */
export const pendentes = (S: Estado) =>
  (S.garmin?.atividades || []).filter((a) => a.data >= S.inicio && modDe(a)).sort((a, b) => b.data.localeCompare(a.data));

export const extraDe = (a: AtividadeGarmin): ExtraGarmin => ({
  atividade: a.id, fc_max: a.resumo.fc_max, calorias: a.resumo.calorias, te_aerobico: a.resumo.te_aerobico,
  te_anaerobico: a.resumo.te_anaerobico, cadencia: a.resumo.cadencia, elevacao_m: a.resumo.elevacao_m,
  dur_s: a.resumo.dur_s, fc: a.resumo.fc, voltas: a.voltas || null,
});

export const norm = (s: string | null | undefined) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------- ligação exercício ↔ Garmin

/** Categorias do Garmin que são abdominal: só elas vão para o exercício de abdômen (e vice-versa) na ligação pela ordem. */
const CATS_ABD = ["crunch", "sit_up", "core", "plank", "leg_raise"];
const ehAbd = (g: GrupoGarmin) => CATS_ABD.includes(g.categoria);

export type Como = "descricao" | "nome" | "ordem" | "manual";
export interface Ligacao { g: number; como: Como }

/** Liga cada exercício da ficha a um grupo de séries do Garmin.
 *  1) a descrição do passo = nome do exercício no app;  2) o "nome no Garmin" do exercício, na ordem
 *  (resolve dois exercícios com o mesmo nome);  3) o que sobrar, pela ordem do treino. */
export function ligar(ficha: Exercicio[], grupos: GrupoGarmin[]): Record<string, Ligacao> {
  const mapa: Record<string, Ligacao> = {};
  const usado = new Set<number>();
  grupos.forEach((g, gi) => {
    if (!g.descricao) return;
    const ex = ficha.find((e) => !mapa[e.id] && norm(e.nome) === norm(g.descricao));
    if (ex) { mapa[ex.id] = { g: gi, como: "descricao" }; usado.add(gi); }
  });
  ficha.forEach((e) => {
    if (mapa[e.id] || !e.garmin) return;
    const gi = grupos.findIndex((g, i) => !usado.has(i) && norm(g.nome) === norm(e.garmin));
    if (gi >= 0) { mapa[e.id] = { g: gi, como: "nome" }; usado.add(gi); }
  });
  // pela ordem: cada grupo que sobrou vai para o próximo exercício livre depois do último já ligado.
  // Exercício pulado no relógio (tudo zerado) não entra pela ordem: costuma ser um que não está na ficha.
  grupos.forEach((g, gi) => {
    if (usado.has(gi) || g.pulado) return;
    let ultimo = -1;
    ficha.forEach((e, ei) => { const l = mapa[e.id]; if (l && l.g < gi) ultimo = Math.max(ultimo, ei); });
    const ex = ficha.find((e, ei) => ei > ultimo && !mapa[e.id] && !!e.manual === ehAbd(g)
      && !(e.garmin && norm(e.garmin) !== norm(g.nome)));
    if (ex) { mapa[ex.id] = { g: gi, como: "ordem" }; usado.add(gi); }
  });
  return mapa;
}

/** Qual ficha mais parece com o treino do relógio (para sugerir quando não há registro no dia). */
export function fichaProvavel(S: Estado, a: AtividadeGarmin): ItemId {
  const grupos = a.exercicios || [];
  const planejado = S.padrao[dow(a.data)];
  let melhor: ItemId = ITENS_DA_MOD.forca.includes(planejado) ? planejado : "A", nota = -1;
  ITENS_DA_MOD.forca.forEach((k) => {
    const mapa = ligar(S.fichas[k as "A"], grupos);
    const fortes = Object.values(mapa).filter((l) => l.como !== "ordem").length;
    const n = fortes * 10 - Math.abs(S.fichas[k as "A"].length - grupos.length) + (k === planejado ? 3 : 0);
    if (n > nota) { nota = n; melhor = k; }
  });
  return melhor;
}

// ---------------------------------------------------------------- linhas da revisão (musculação)

export type Acao = "garmin" | "manter" | "pulado" | "sem";
export interface Linha {
  ex: Exercicio;
  atual?: ExercicioSessao;
  anotado: boolean;      // você anotou: o Garmin não mexe
  g: number | null;      // grupo do Garmin ligado
  como: Como | null;
  acao: Acao;
  variante: number;
  series: Serie[];
  aviso: string;
}

const varMaquina = (ex: Exercicio) => Math.max(0, ex.variantes.findIndex((v) => !v.biset));

/** Séries do Garmin no formato do app. Primeira série de 20+ reps com carga menor = aquecimento. */
export function seriesDoGrupo(g: GrupoGarmin): Serie[] {
  const max = Math.max(0, ...g.series.map((s) => s.kg));
  return g.series.map((s, i) => ({ t: i === 0 && s.reps >= 20 && s.kg < max ? "A" : "S", kg: s.kg, reps: s.reps, feito: true }));
}

/** Monta a linha de um exercício a partir do grupo do Garmin escolhido (ou nenhum). */
export function linhaPara(ex: Exercicio, atual: ExercicioSessao | undefined, grupos: GrupoGarmin[], g: number | null, como: Como | null): Linha {
  const anotado = !!atual && (exValido(atual) || !!atual.pulado);
  const base: Linha = { ex, atual, anotado, g, como, acao: "sem", variante: atual?.variante || 0, series: [], aviso: "" };
  if (anotado) return { ...base, acao: "manter", series: atual!.series };
  const grupo = g == null ? null : grupos[g];
  if (!grupo) return base;
  if (grupo.pulado) return { ...base, acao: "pulado" };
  if (ex.manual) {
    // abdominal: com carga alta é a máquina; sem carga é o livre (bi-set), que você preenche
    const max = Math.max(0, ...grupo.series.map((s) => s.kg));
    if (!max) return { ...base, aviso: "Sem carga no relógio: é o livre (bi-set), fica para você preencher." };
    return { ...base, acao: "garmin", variante: varMaquina(ex), series: seriesDoGrupo(grupo),
      aviso: max < 25 ? "Carga baixa para a máquina: confira." : "" };
  }
  return { ...base, acao: "garmin", series: seriesDoGrupo(grupo),
    aviso: como === "ordem" ? "Ligado pela ordem do treino: confira se é este exercício." : "" };
}

export function linhasForca(S: Estado, item: ItemId, a: AtividadeGarmin, sessao?: Sessao): Linha[] {
  const ficha = S.fichas[item as "A"];
  const grupos = a.exercicios || [];
  const mapa = ligar(ficha, grupos);
  return ficha.map((ex) => {
    const atual = sessao?.exercicios?.find((x) => x.id === ex.id);
    const l = mapa[ex.id];
    return linhaPara(ex, atual, grupos, l ? l.g : null, l ? l.como : null);
  });
}

export function exercicioDaLinha(l: Linha): ExercicioSessao {
  const ex = l.ex, vi = ex.variantes[l.variante] ? l.variante : 0;
  const base = {
    id: ex.id, nome: ex.nome, garmin: ex.manual ? "" : ex.garmin || "", manual: !!ex.manual, variante: vi,
    varNome: ex.variantes.length > 1 ? ex.variantes[vi].nome || "Opção " + (vi + 1) : "", biset: ex.variantes[vi].biset || null,
  };
  if (l.acao === "manter" && l.atual) return l.atual;
  if (l.acao === "pulado") return { ...base, pulado: true, series: [] };
  if (l.acao === "garmin") return { ...base, series: l.series.map((s) => ({ ...s, kg: +s.kg || 0, reps: +s.reps || 0, feito: true })) };
  return l.atual && (l.atual.aConfirmar || l.atual.semNota) ? { ...l.atual, aConfirmar: false, semNota: true } : { ...base, semNota: true, series: [] };
}

/** Sessão final: a que já existia (mesmo id, completada) ou uma nova. */
export function sessaoForca(item: ItemId, a: AtividadeGarmin, linhas: Linha[], existente?: Sessao): Sessao {
  const s: Sessao = existente ? clone(existente) : {
    id: uid(), ts: Date.now(), data: a.data, item, kind: "forca", dores: {}, sensacao: null, notas: "", garmin: null,
  };
  s.rapido = false;
  s.exercicios = linhas.map(exercicioDaLinha);
  s.garmin = extraDe(a);
  return s;
}

/** Na confirmação, o app aprende o "nome no Garmin" dos exercícios que ainda não tinham. */
export function fichaAprendida(S: Estado, item: ItemId, a: AtividadeGarmin, linhas: Linha[]): Exercicio[] | null {
  const grupos = a.exercicios || [];
  let mudou = false;
  const ficha = clone(S.fichas[item as "A"]).map((ex) => {
    const l = linhas.find((x) => x.ex.id === ex.id);
    if (!ex.manual && !ex.garmin && l && l.acao === "garmin" && l.g != null && grupos[l.g]?.nome) {
      mudou = true;
      return { ...ex, garmin: grupos[l.g].nome };
    }
    return ex;
  });
  return mudou ? ficha : null;
}

// ---------------------------------------------------------------- cardio

export function itemCardioProvavel(S: Estado, a: AtividadeGarmin): ItemId {
  const mod = modDe(a) as Modalidade, opcoes = ITENS_DA_MOD[mod];
  const jaNoDia = S.sessoes.find((s) => s.data === a.data && opcoes.includes(s.item));
  if (jaNoDia) return jaNoDia.item;
  const planejado = S.padrao[dow(a.data)];
  if (opcoes.includes(planejado)) return planejado;
  if (mod === "corrida") return (a.resumo.dist_km || 0) >= 12 ? "LG" : "RL";
  return opcoes[0];
}

export const sessaoDoDia = (S: Estado, data: string, item: ItemId) =>
  S.sessoes.find((s) => s.data === data && s.item === item);

export function sessaoCardio(a: AtividadeGarmin, item: ItemId, cardio: Sessao["cardio"], existente?: Sessao): Sessao {
  const s: Sessao = existente ? clone(existente) : {
    id: uid(), ts: Date.now(), data: a.data, item, kind: "cardio", dores: {}, sensacao: null, notas: "", garmin: null,
  };
  s.rapido = false;
  s.cardio = cardio;
  s.garmin = extraDe(a);
  return s;
}

/** Distância que o Garmin sugere: a bike indoor vem zerada, então nada é sugerido. */
export const distSugerida = (a: AtividadeGarmin) => (modDe(a) === "bike" ? null : a.resumo.dist_km || null);
