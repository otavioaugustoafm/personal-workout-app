import axios from "axios";
import { limparToken, obterToken } from "./auth";

export const SESSAO_EXPIRADA = "sessao-expirada";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use((config) => {
  const token = obterToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (resposta) => resposta,
  (erro) => {
    // 401 fora da tela de login = token expirou (ex.: virou a segunda-feira)
    if (erro.response?.status === 401 && !erro.config?.url?.includes("/auth/login")) {
      limparToken();
      window.dispatchEvent(new Event(SESSAO_EXPIRADA));
    }
    return Promise.reject(erro);
  },
);

/** Texto amigavel para erros do backend (o FastAPI manda `detail` como texto ou como lista de problemas). */
export function mensagemDeErro(erro: unknown, padrao = "Não foi possível salvar. Tente novamente."): string {
  // sem resposta nenhuma = nao chegou na API (rede, URL errada ou bloqueio de CORS no navegador)
  if (!(erro as { response?: unknown }).response) {
    return "Sem resposta do servidor. Verifique a conexão, a VITE_API_URL e o ALLOWED_ORIGINS da API.";
  }
  const detalhe = (erro as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
  if (typeof detalhe === "string") return detalhe;
  if (Array.isArray(detalhe)) {
    const msgs = detalhe.map((d) => (d as { msg?: string }).msg).filter(Boolean);
    if (msgs.length) return msgs.join(" ");
  }
  return padrao;
}

// ---------- rotas do app de treinos ----------
import type { Estado, Exercicio, FichaId, ItemId, Rascunho, Sessao } from "./dominio";

export const rotas = {
  estado: () => api.get<Estado>("/api/v1/estado").then((r) => r.data),
  configuracao: (dados: { semana_padrao?: ItemId[]; inicio?: string; respondidos?: Record<string, "nao"> }) =>
    api.put("/api/v1/configuracao", dados),
  ficha: (id: FichaId, exercicios: Exercicio[]) => api.put(`/api/v1/fichas/${id}`, { exercicios }),
  criarSessao: (s: Sessao) => api.post<Sessao>("/api/v1/sessoes", s).then((r) => r.data),
  excluirSessao: (id: string) => api.delete(`/api/v1/sessoes/${id}`),
  excluirDia: (data: string) => api.delete("/api/v1/sessoes", { params: { data } }),
  rascunho: (item: ItemId, dados: Rascunho) => api.put(`/api/v1/rascunhos/${item}`, { dados }),
  excluirRascunho: (item: ItemId) => api.delete(`/api/v1/rascunhos/${item}`),
  backup: () => api.get<Estado>("/api/v1/backup").then((r) => r.data),
  usarGarmin: (id: string, sessao: Sessao) => api.post<Sessao>(`/api/v1/garmin/${id}/usar`, { sessao }).then((r) => r.data),
  ignorarGarmin: (id: string) => api.post(`/api/v1/garmin/${id}/ignorar`),
  sincronizarGarmin: () => api.post<{ novas: number }>("/api/v1/garmin/sincronizar", null, { timeout: 70000 }).then((r) => r.data),
  importar: (backup: unknown) => api.post<{ sessoes: number }>("/api/v1/backup/importar", backup).then((r) => r.data),
};
