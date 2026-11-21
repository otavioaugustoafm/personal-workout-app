import { createContext, useContext } from "react";
import type { Estado, Exercicio, FichaId, ItemId, Rascunho, Sessao } from "./dominio";

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
  sincronizarGarmin: () => Promise<void>;
  aviso: (texto: string, erro?: boolean) => void;
}

export const StoreCtx = createContext<Store | null>(null);

export const useStore = () => {
  const s = useContext(StoreCtx);
  if (!s) throw new Error("useStore fora do StoreProvider");
  return s;
};
