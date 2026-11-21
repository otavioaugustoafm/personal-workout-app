import { useState } from "react";
import { api } from "../lib/api";
import { salvarToken } from "../lib/auth";
import { Halter } from "./Icones";

export default function Login({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const r = await api.post("/api/v1/auth/login", { senha });
      salvarToken(r.data.token);
      onLoginSuccess();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      setErro(status === 401 ? "Senha incorreta. Tente de novo." : "Não foi possível falar com o servidor. Verifique sua conexão.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="login">
      <div className="login-box">
        <div className="logo-big"><Halter cor="#2a2208" tam={24} /></div>
        <h1>Seus treinos</h1>
        <p className="sub" style={{ fontSize: 16, margin: "12px 0 28px" }}>Digite a senha para ver o treino de hoje.</p>
        <form onSubmit={entrar} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label htmlFor="senha" className="sr-only">Senha</label>
          <div className="field">
            <input id="senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Senha"
              autoFocus autoComplete="current-password" required aria-invalid={!!erro} />
          </div>
          {erro && <p role="alert" style={{ color: "var(--bad)", margin: 0, fontSize: 14 }}>{erro}</p>}
          <button type="submit" disabled={carregando} className="btn fill" style={{ padding: "12px 16px", fontSize: 16 }}>
            {carregando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
