import { useEffect, useState } from "react";
import Login from "./components/Login";
import Painel from "./components/Painel";
import { SESSAO_EXPIRADA } from "./lib/api";
import { limparToken, obterToken, tokenValido } from "./lib/auth";
import { StoreProvider } from "./components/StoreProvider";

export default function App() {
  const [logado, setLogado] = useState(() => tokenValido(obterToken()));

  useEffect(() => {
    const aoExpirar = () => setLogado(false);
    window.addEventListener(SESSAO_EXPIRADA, aoExpirar);
    return () => window.removeEventListener(SESSAO_EXPIRADA, aoExpirar);
  }, []);

  const sair = () => {
    limparToken();
    setLogado(false);
  };

  if (!logado) return <Login onLoginSuccess={() => setLogado(true)} />;
  return (
    <StoreProvider>
      <Painel onLogout={sair} />
    </StoreProvider>
  );
}
