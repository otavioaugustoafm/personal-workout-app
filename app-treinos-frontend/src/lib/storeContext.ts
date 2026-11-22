import { createContext, useContext } from "react";
import type { Estado, Exercicio, FichaId, ItemId, Rascunho, Sessao } from "./dominio";
import type { Analise, TipoIA } from "./saude";

export interface Store {
  S: Estado;
  salvarConfig: (d: { padrao?: ItemId[]; inicio?: string; respondidos?: Record<string, "nao"> }) => void;
  salvarFicha: (id: FichaId, exercicios: Exercicio[]) => void;
  salvarRascunho: (item: ItemId, r: Rascunho) => void;
  descartarRascunho: (item: ItemId) => void;
  registrarSessao: (s: Sessao) => Promise<boolean>;
  excluirSessao: (id: string) => Promise<void>;
  excluirDia: (data: string) => Promise<void>;
  recarregar: () => Promise<void>;
  usarGarmin: (atividadeId: string, s: Sessao) => Promise<boolean>;
  ignorarGarmin: (atividadeId: string) => Promise<void>;
  sincronizarGarmin: (silencioso?: boolean) => Promise<void>;
  /** Gera (ou devolve a guardada) uma análise da IA. `auto`: pedida pelo app sozinho, respeita o teto automático. */
  analisar: (tipo: TipoIA, chave: string, opcoes?: { forcar?: boolean; auto?: boolean }) => Promise<Analise | null>;
  salvarContexto: (texto: string) => Promise<boolean>;
  aviso: (texto: string, erro?: boolean) => void;
}

export const StoreCtx = createContext<Store | null>(null);

export const useStore = () => {
  const s = useContext(StoreCtx);
  if (!s) throw new Error("useStore fora do StoreProvider");
  return s;
};
