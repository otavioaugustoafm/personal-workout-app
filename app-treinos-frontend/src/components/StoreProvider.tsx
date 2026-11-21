// Estado do app em memória + gravação na API. A tela responde na hora; a gravação vai em seguida
// (fichas e rascunhos esperam você parar de digitar para não mandar uma requisição por tecla).
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { mensagemDeErro, rotas } from "../lib/api";
import type { Estado } from "../lib/dominio";
import { StoreCtx, type Store } from "../lib/storeContext";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [S, setS] = useState<Estado | null>(null);
  const [erro, setErro] = useState("");
  const [toast, setToast] = useState<{ t: string; erro?: boolean } | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const aviso = useCallback((t: string, e?: boolean) => {
    setToast({ t, erro: e });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const recarregar = useCallback(async () => {
    try {
      setS(await rotas.estado());
      setErro("");
    } catch (e) {
      setErro(mensagemDeErro(e, "Não foi possível carregar seus treinos."));
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    rotas.estado()
      .then((e) => { if (ativo) setS(e); })
      .catch((e) => { if (ativo) setErro(mensagemDeErro(e, "Não foi possível carregar seus treinos.")); });
    return () => { ativo = false; };
  }, []);

  if (!S) {
    return (
      <div className="carregando">
        {erro ? (
          <div className="card" style={{ maxWidth: 420 }}>
            <p style={{ margin: "0 0 12px" }}>{erro}</p>
            <button className="btn fill" type="button" onClick={recarregar}>Tentar de novo</button>
          </div>
        ) : (
          <span className="sub">Carregando seus treinos…</span>
        )}
      </div>
    );
  }

  const falhou = (e: unknown) => aviso(mensagemDeErro(e), true);
  const depois = (chave: string, fn: () => Promise<unknown>, ms = 700) => {
    clearTimeout(timers.current[chave]);
    timers.current[chave] = setTimeout(() => { fn().catch(falhou); }, ms);
  };

  const store: Store = {
    S,
    aviso,
    recarregar,
    salvarConfig: ({ padrao, inicio, respondidos }) => {
      setS((s) => s && { ...s, padrao: padrao ?? s.padrao, inicio: inicio ?? s.inicio, respondidos: respondidos ?? s.respondidos });
      rotas.configuracao({ semana_padrao: padrao, inicio, respondidos }).catch(falhou);
    },
    salvarFicha: (id, exercicios) => {
      setS((s) => s && { ...s, fichas: { ...s.fichas, [id]: exercicios } });
      depois("ficha-" + id, () => rotas.ficha(id, exercicios));
    },
    salvarRascunho: (item, r) => {
      setS((s) => s && { ...s, rascunhos: { ...s.rascunhos, [item]: r } });
      depois("rasc-" + item, () => rotas.rascunho(item, r), 900);
    },
    descartarRascunho: (item) => {
      clearTimeout(timers.current["rasc-" + item]);
      setS((s) => {
        if (!s) return s;
        const r = { ...s.rascunhos };
        delete r[item];
        return { ...s, rascunhos: r };
      });
      rotas.excluirRascunho(item).catch(falhou);
    },
    registrarSessao: async (sessao) => {
      try {
        const salva = await rotas.criarSessao(sessao);
        setS((s) => s && { ...s, sessoes: [...s.sessoes.filter((x) => x.id !== salva.id), salva] });
        return true;
      } catch (e) {
        falhou(e);
        return false;
      }
    },
    excluirSessao: async (id) => {
      try {
        await rotas.excluirSessao(id);
        setS((s) => s && { ...s, sessoes: s.sessoes.filter((x) => x.id !== id) });
      } catch (e) { falhou(e); }
    },
    excluirDia: async (data) => {
      try {
        await rotas.excluirDia(data);
        setS((s) => s && { ...s, sessoes: s.sessoes.filter((x) => x.data !== data) });
      } catch (e) { falhou(e); }
    },
  };

  return (
    <StoreCtx.Provider value={store}>
      {children}
      {toast && <div className={"toast" + (toast.erro ? " erro" : "")} role="status">{toast.t}</div>}
    </StoreCtx.Provider>
  );
}
