// Tipos de sono/recuperação, prontidão e análises da IA (vindos da API).
export interface Sono {
  seg: number; profundo: number | null; leve: number | null; rem: number | null; acordado: number | null;
  despertares: number | null; nota: number | null; fc: number | null; respiracao: number | null; estresse: number | null;
}
export interface Hrv { noite: number; semana: number | null; faixa_min: number | null; faixa_max: number | null; status: string }
export interface ResumoDia {
  bb_max: number | null; bb_min: number | null; bb_carregou: number | null; bb_gastou: number | null; bb_atual: number | null;
  fc_repouso: number | null; estresse: number | null; min_moderados: number | null; min_vigorosos: number | null;
}
export interface ParteProntidao { nota: number; txt: string; nome: string; peso: number }
export interface Prontidao {
  nota: number; faixa: "alta" | "moderada" | "baixa"; partes: Record<string, ParteProntidao>; dor_recente: string[]; completa: boolean;
}
export interface DiaSaude { data: string; sono: Sono | null; hrv: Hrv | null; resumo: ResumoDia | null; prontidao: Prontidao | null }

export type TipoIA = "prontidao" | "treino" | "semana" | "musculacao" | "cardio" | "sono";
export interface Analise { tipo: TipoIA; chave: string; modelo: string; texto: string; custo_usd: number; criado_em: string }
export interface EstadoIA { analises: Analise[]; gasto_mes: number; limite_auto: number; limite: number; configurada: boolean }

export const fmtHoras = (seg: number | null | undefined) =>
  seg ? `${Math.floor(seg / 3600)}h${String(Math.round((seg % 3600) / 60)).padStart(2, "0")}` : "—";
export const fmtUsd = (n: number) =>
  n > 0 && n < 0.001 ? "< US$ 0,001" : "US$ " + n.toFixed(n < 0.1 ? 3 : 2).replace(".", ",");
export const NOME_MODELO: Record<string, string> = {
  "claude-haiku-5-5": "Haiku 5.5", "claude-sonnet-5-5": "Sonnet 5.5", "claude-opus-5-5": "Opus 5.5",
};
export const corFaixa = (n: number) => (n >= 75 ? "var(--ok)" : n >= 50 ? "var(--warn)" : "var(--bad)");
