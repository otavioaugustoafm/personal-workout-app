import type { Sessao } from "./dominio";

/** Dores, sensação e notas de um treino. */
export interface ComoFoi { dores: Sessao["dores"]; sensacao: Sessao["sensacao"]; notas: string }

export const comoFoiDe = (s?: Sessao): ComoFoi => ({ dores: { ...(s?.dores || {}) }, sensacao: s?.sensacao ?? null, notas: s?.notas || "" });
