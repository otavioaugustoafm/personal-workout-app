// Estado do app em memória + gravação na API. A tela responde na hora; a gravação vai em seguida
// (fichas e rascunhos esperam você parar de digitar para não mandar uma requisição por tecla).
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { mensagemDeErro, rotas } from "../lib/api";
import type { Estado, Sessao } from "../lib/dominio";
import type { Analise } from "../lib/saude";
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

  const tirarDaFila = (id: string) => (s: Estado | null) =>
    s && { ...s, garmin: s.garmin && { ...s.garmin, atividades: s.garmin.atividades.filter((a) => a.id !== id) } };

  const guardarAnalise = (a: Analise & { gasto_mes?: number }) => setS((s) => s && s.ia ? {
    ...s, ia: { ...s.ia, gasto_mes: a.gasto_mes ?? s.ia.gasto_mes, analises: [...s.ia.analises.filter((x) => !(x.tipo === a.tipo && x.chave === a.chave)), a] },
  } : s);
  const analisar: Store["analisar"] = async (tipo, chave, op = {}) => {
    try {
      const a = await rotas.analisar(tipo, chave, !!op.forcar, !!op.auto);
      guardarAnalise(a);
      return a;
    } catch (e) {
      if (!op.auto) aviso(mensagemDeErro(e, "Não foi possível gerar a análise."), true);
      return null;
    }
  };
  // treino salvo com dados de verdade: a IA analisa sozinha (Sonnet), dentro do teto automático
  const analisarTreinoSalvo = (s: Sessao) => {
    const temDados = s.kind === "forca" ? (s.exercicios || []).some((e) => e.series?.length && !e.pulado && !e.semNota) : !!(s.cardio?.dist || s.cardio?.dur_s);
    if (!s.rapido && temDados && S.ia?.configurada) analisar("treino", s.id, { auto: true });
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
        analisarTreinoSalvo(salva);
        return true;
      } catch (e) {
        falhou(e);
        return false;
      }
    },
    // apagar uma sessão devolve a atividade do Garmin dela para a fila: recarrega para ela reaparecer
    excluirSessao: async (id) => {
      try {
        await rotas.excluirSessao(id);
        setS((s) => s && { ...s, sessoes: s.sessoes.filter((x) => x.id !== id) });
        if (S.garmin) recarregar();
      } catch (e) { falhou(e); }
    },
    excluirDia: async (data) => {
      try {
        await rotas.excluirDia(data);
        setS((s) => s && { ...s, sessoes: s.sessoes.filter((x) => x.data !== data) });
        if (S.garmin) recarregar();
      } catch (e) { falhou(e); }
    },
    usarGarmin: async (atividadeId, sessao) => {
      try {
        const salva = await rotas.usarGarmin(atividadeId, sessao);
        setS((s) => tirarDaFila(atividadeId)(s && { ...s, sessoes: [...s.sessoes.filter((x) => x.id !== salva.id), salva] }));
        analisarTreinoSalvo(salva);
        return true;
      } catch (e) {
        falhou(e);
        return false;
      }
    },
    ignorarGarmin: async (atividadeId) => {
      try {
        await rotas.ignorarGarmin(atividadeId);
        setS(tirarDaFila(atividadeId));
      } catch (e) { falhou(e); }
    },
    analisar,
    editarSessao: async (sessao) => {
      try {
        const salva = await rotas.editarSessao(sessao);
        setS((s) => s && { ...s, sessoes: s.sessoes.map((x) => (x.id === salva.id ? salva : x)) });
        const temDados = salva.kind === "forca" ? (salva.exercicios || []).some((e) => e.series?.length && !e.pulado && !e.semNota) : !!(salva.cardio?.dist || salva.cardio?.dur_s);
        if (temDados && S.ia?.configurada) analisar("treino", salva.id, { forcar: true, auto: true });
        return true;
      } catch (e) {
        falhou(e);
        return false;
      }
    },
    salvarContexto: async (texto) => {
      try {
        await rotas.configuracao({ contexto_ia: texto });
        setS((s) => s && { ...s, contexto_ia: texto });
        return true;
      } catch (e) {
        falhou(e);
        return false;
      }
    },
    sincronizarGarmin: async (silencioso = false) => {
      try {
        const r = await rotas.sincronizarGarmin();
        await recarregar();
        if (!silencioso) aviso(r.novas ? `${r.novas} atividade${r.novas > 1 ? "s" : ""} nova${r.novas > 1 ? "s" : ""} do Garmin` : "Nada novo no Garmin");
      } catch (e) {
        if (!silencioso) aviso(mensagemDeErro(e, "Não foi possível sincronizar com o Garmin."), true);
        recarregar();
      }
    },
  };

  return (
    <StoreCtx.Provider value={store}>
      {children}
      {toast && <div className={"toast" + (toast.erro ? " erro" : "")} role="status">{toast.t}</div>}
    </StoreCtx.Provider>
  );
}
