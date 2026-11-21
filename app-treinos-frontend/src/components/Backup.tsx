import { useState } from "react";
import { mensagemDeErro, rotas } from "../lib/api";
import { useStore } from "../lib/storeContext";

/** Copiar todos os dados e importar o backup da página antiga (ou de outro momento). */
export default function Backup({ onFechar }: { onFechar: () => void }) {
  const { aviso, recarregar } = useStore();
  const [texto, setTexto] = useState("");
  const [msg, setMsg] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const copiar = async () => {
    try {
      const dados = await rotas.backup();
      await navigator.clipboard.writeText(JSON.stringify(dados));
      aviso("Dados copiados");
    } catch (e) {
      setMsg(mensagemDeErro(e, "Não consegui copiar. Tente de novo."));
    }
  };

  const importar = async () => {
    let dados: { sessoes?: unknown[] };
    try { dados = JSON.parse(texto); } catch { setMsg("O texto colado não é um backup válido."); return; }
    if (!dados || !Array.isArray(dados.sessoes)) { setMsg("Faltam fichas, semana ou sessões nesse backup."); return; }
    if (!confirmar) { setConfirmar(true); setMsg(`Isso troca os dados atuais por ${dados.sessoes.length} registros do backup.`); return; }
    setOcupado(true);
    try {
      const r = await rotas.importar(dados);
      await recarregar();
      aviso(`Backup importado: ${r.sessoes} registros`);
      setTexto(""); setMsg(""); setConfirmar(false); onFechar();
    } catch (e) {
      setMsg(mensagemDeErro(e, "Não consegui importar."));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="card backup">
      <div className="row">
        <h2 style={{ fontSize: 20 }}>Backup dos dados</h2>
        <span className="spacer" />
        <button className="btn small" type="button" onClick={copiar}>Copiar dados</button>
        <button className="btn small ghost" type="button" onClick={onFechar}>Fechar</button>
      </div>
      <p className="sub" style={{ margin: 0 }}>
        Os dados ficam no seu banco do Neon. Para trazer o que você anotou na página antiga, abra o Backup de lá, toque em
        "Copiar dados" e cole aqui.
      </p>
      <div className="field">
        <label htmlFor="import-text">Importar (substitui os dados atuais)</label>
        <textarea id="import-text" rows={3} value={texto} placeholder='{"fichas": …}'
          onChange={(e) => { setTexto(e.target.value); setConfirmar(false); setMsg(""); }} />
      </div>
      <div className="row">
        <span className="sub">{msg}</span>
        <span className="spacer" />
        <button className={"btn small" + (confirmar ? " danger" : "")} type="button" disabled={!texto || ocupado} onClick={importar}>
          {confirmar ? "Confirmar: substituir tudo" : "Importar backup"}
        </button>
      </div>
    </div>
  );
}
