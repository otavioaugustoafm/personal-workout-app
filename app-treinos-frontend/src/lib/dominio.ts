// Tipos, catálogo de treinos e utilidades de data/formatação.

export type ItemId = "A" | "B" | "C" | "D" | "RQ" | "RL" | "LG" | "BK" | "BI" | "OFF";
export type FichaId = "A" | "B" | "C" | "D";
export type Kind = "forca" | "cardio" | "descanso";
export type Nivel = "ok" | "leve" | "dor";

export interface Serie {
  t: "F" | "A" | "S";
  kg: number;
  reps: number;
  kg2?: number;
  reps2?: number;
  feito?: boolean;
}
export interface Variante {
  nome: string;
  series: Serie[];
  biset?: string[];
}
export interface Exercicio {
  id: string;
  nome: string;
  garmin: string;
  ajuste: string;
  manual?: boolean;
  variantes: Variante[];
}
export type StatusEx = "pulado" | "sug" | "gar";
export interface ExercicioSessao {
  id: string;
  nome: string;
  garmin?: string;
  manual?: boolean;
  variante: number;
  varNome?: string;
  biset?: string[] | null;
  series: Serie[];
  pulado?: boolean;
  aConfirmar?: boolean;
  semNota?: boolean;
}
export interface Cardio {
  dist: number | null;
  dur_s: number | null;
  fc: number | null;
}
export interface Sessao {
  id: string;
  ts: number;
  data: string;
  item: ItemId;
  kind: Kind;
  exercicios?: ExercicioSessao[];
  cardio?: Cardio;
  dores: Record<string, Nivel>;
  sensacao: "leve" | "ok" | "pesado" | null;
  notas: string;
  rapido?: boolean;
  garmin?: unknown;
}
export interface RascunhoEx {
  variante: number;
  series: Serie[];
  status?: StatusEx;
}
export interface Rascunho {
  item: ItemId;
  data: string;
  ex: Record<string, RascunhoEx>;
  dores: Record<string, Nivel | "">;
  sensacao: string;
  notas: string;
  dist: number | null;
  dur: string;
  fc: number | null;
}
export interface Estado {
  padrao: ItemId[];
  inicio: string;
  respondidos: Record<string, "nao">;
  fichas: Record<FichaId, Exercicio[]>;
  sessoes: Sessao[];
  rascunhos: Partial<Record<ItemId, Rascunho>>;
}

export interface ItemInfo {
  kind: Kind;
  nome: string;
  curto: string;
  slot: string | null;
  mod?: "corrida" | "bike";
  c: string;
  det?: string;
}

export const ITEMS: Record<ItemId, ItemInfo> = {
  A: { kind: "forca", nome: "Peito e Tríceps", curto: "Peito", slot: "A", c: "var(--c-a)" },
  B: { kind: "forca", nome: "Costas e Bíceps", curto: "Costas", slot: "B", c: "var(--c-b)", det: "Inclui a lombar" },
  C: { kind: "forca", nome: "Ombro e Antebraço", curto: "Ombro", slot: "C", c: "var(--c-c)", det: "Ombro, antebraço e trapézio" },
  D: { kind: "forca", nome: "Perna", curto: "Perna", slot: "D", c: "var(--c-d)", det: "Dia isolado: sem corrida ou bike" },
  RQ: { kind: "cardio", nome: "Corrida de qualidade", curto: "Corrida", slot: "RUN", mod: "corrida", c: "var(--c-run)", det: "Tiros ou ritmo" },
  RL: { kind: "cardio", nome: "Corrida leve", curto: "Corrida", slot: "RUN", mod: "corrida", c: "var(--c-run)", det: "Zona 2, ritmo de conversa" },
  LG: { kind: "cardio", nome: "Longão", curto: "Longão", slot: "LONG", mod: "corrida", c: "var(--c-run)", det: "Corrida longa em ritmo confortável" },
  BK: { kind: "cardio", nome: "Bike indoor", curto: "Bike", slot: "BIKE", mod: "bike", c: "var(--c-bike)", det: "Zona 2, 60 a 75 min. Véspera do longão: sem intervalado" },
  BI: { kind: "cardio", nome: "Bike intervalada", curto: "Bike", slot: "BIKE", mod: "bike", c: "var(--c-bike)", det: "Cerca de 45 min: 6 a 8 tiros de 2 min forte com 2 min leve" },
  OFF: { kind: "descanso", nome: "Descanso", curto: "Descanso", slot: null, c: "var(--c-off)", det: "Folga ou só mobilidade" },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const FICHA_IDS: FichaId[] = ["A", "B", "C", "D"];
export const STANDARD: ItemId[] = ["A", "RQ", "B", "D", "C", "BK", "LG"];
export const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
export const DIAS_C = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export const DORES: Record<string, string> = {
  joelho: "Joelho", cotovelo: "Cotovelo", costas: "Costas/lombar", quadril: "Quadril", tornozelo: "Tornozelo", ombro: "Ombro", punho: "Punho",
};
export const NIVEL: Record<Nivel, string> = { ok: "sem dor", leve: "incomodou", dor: "doeu" };
export const SENSACAO: Record<string, string> = { leve: "leve", ok: "no ponto", pesado: "pesado" };

export const slotOf = (it: string | null | undefined) => (it && ITEMS[it as ItemId]?.slot) || null;

// ---------- datas (sempre no fuso do aparelho) ----------
export function isoOf(d: Date): string {
  const z = new Date(d);
  z.setMinutes(z.getMinutes() - z.getTimezoneOffset());
  return z.toISOString().slice(0, 10);
}
export const isoToday = () => isoOf(new Date());
export function dateOf(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(iso: string, n: number): string {
  const d = dateOf(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
}
export const dow = (iso: string) => (dateOf(iso).getDay() + 6) % 7;
export const mondayOf = (iso: string) => addDays(iso, -dow(iso));
export const ddmm = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
export const fmtDateLong = (iso: string) => dateOf(iso).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

// ---------- números ----------
export const fmtKg = (n: number) => (Math.round((+n || 0) * 10) / 10).toString().replace(".", ",");
export const fmtInt = (n: number) => Math.round(n).toLocaleString("pt-BR");
export const fmtKm = (n: number) =>
  (Math.round((n || 0) * 10) / 10).toLocaleString("pt-BR", { minimumFractionDigits: n % 1 ? 1 : 0, maximumFractionDigits: 1 });
export function parseDur(v: string | null | undefined): number | null {
  if (!v) return null;
  const p = String(v).trim().split(/[:h.,']/).filter((x) => x !== "").map(Number);
  if (!p.length || p.some(isNaN)) return null;
  if (p.length === 1) return p[0] * 60;
  if (p.length === 2) return p[0] * 60 + p[1];
  return p[0] * 3600 + p[1] * 60 + p[2];
}
export function fmtDur(sec: number | null | undefined): string {
  if (sec == null) return "—";
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
}
export function fmtPace(secPerKm: number): string {
  if (!secPerKm || !isFinite(secPerKm)) return "—";
  const m = Math.floor(secPerKm / 60), x = Math.round(secPerKm % 60);
  return x === 60 ? `${m + 1}:00` : `${m}:${String(x).padStart(2, "0")}`;
}
export const fmtVel = (dist: number, dur: number) => (dist / (dur / 3600)).toFixed(1).replace(".", ",");
export const uid = () => "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
