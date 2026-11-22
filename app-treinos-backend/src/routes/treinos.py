"""Rotas do app de treinos. Todas exigem o token de acesso."""
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, ValidationError

from src import repositorio as repo
from src.dependencies import exigir_acesso
from src.modelos import (FICHAS, ITENS, ConfiguracaoPayload, Exercicio, FichaPayload, RascunhoPayload,
                         SessaoPayload)

router = APIRouter(prefix="/api/v1", tags=["Treinos"], dependencies=[Depends(exigir_acesso)])


@router.get("/estado")
def estado():
    """Tudo de uma vez: semana padrao, fichas, sessoes e rascunhos. Uso pessoal: poucos dados."""
    return repo.ler_estado()


@router.put("/configuracao", status_code=status.HTTP_204_NO_CONTENT)
def configuracao(payload: ConfiguracaoPayload):
    repo.atualizar_configuracao(payload.semana_padrao, payload.inicio, payload.respondidos, payload.contexto_ia)


@router.put("/fichas/{ficha_id}", status_code=status.HTTP_204_NO_CONTENT)
def salvar_ficha(ficha_id: str, payload: FichaPayload):
    if ficha_id not in FICHAS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Ficha inexistente.")
    ids = [e.id for e in payload.exercicios]
    if len(ids) != len(set(ids)):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Exercicios com id repetido.")
    repo.salvar_ficha(ficha_id, [e.model_dump(exclude_none=True) for e in payload.exercicios])


@router.post("/sessoes", status_code=status.HTTP_201_CREATED)
def criar_sessao(payload: SessaoPayload):
    return repo.criar_sessao(payload.model_dump(mode="json"))


@router.put("/sessoes/{sessao_id}")
def editar_sessao(sessao_id: str, payload: SessaoPayload):
    if payload.id != sessao_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="O id do corpo não bate com o da URL.")
    salva = repo.atualizar_sessao(payload.model_dump(mode="json"))
    if salva is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Registro nao encontrado.")
    return salva


@router.delete("/sessoes/{sessao_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_sessao(sessao_id: str):
    if not repo.excluir_sessao(sessao_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Registro nao encontrado.")


@router.delete("/sessoes", status_code=status.HTTP_200_OK)
def excluir_do_dia(data: date = Query(..., description="Apaga os registros deste dia (Desfazer registro)")):
    return {"removidos": repo.excluir_sessoes_do_dia(data)}


@router.put("/rascunhos/{item}", status_code=status.HTTP_204_NO_CONTENT)
def salvar_rascunho(item: str, payload: RascunhoPayload):
    if item not in ITENS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Treino inexistente.")
    repo.salvar_rascunho(item, payload.dados)


@router.delete("/rascunhos/{item}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_rascunho(item: str):
    repo.excluir_rascunho(item)


class BackupPayload(BaseModel):
    """O mesmo texto do botao "Copiar dados" (da pagina original ou deste app)."""
    padrao: list[str] = Field(..., min_length=7, max_length=7)
    inicio: date | None = None
    respondidos: dict[str, str] = Field(default_factory=dict)
    fichas: dict[str, list[dict[str, Any]]]
    sessoes: list[dict[str, Any]] = Field(..., max_length=20000)
    rascunhos: dict[str, Any] = Field(default_factory=dict)


@router.get("/backup")
def exportar():
    return repo.ler_estado()


@router.post("/backup/importar")
def importar(payload: BackupPayload):
    """Substitui tudo pelo backup. Valida cada parte antes de mexer no banco."""
    try:
        cfg = ConfiguracaoPayload(semana_padrao=payload.padrao, inicio=payload.inicio,
                                  respondidos={k: v for k, v in payload.respondidos.items() if v == "nao"})
        fichas = {}
        for fid, exs in payload.fichas.items():
            if fid not in FICHAS:
                continue
            fichas[fid] = [Exercicio(**e).model_dump(exclude_none=True) for e in exs]
        sessoes = []
        for s in payload.sessoes:
            s = dict(s)
            if not s.get("dores") and s.get("joelho"):
                s["dores"] = {"joelho": s["joelho"]}
            s["dores"] = {k: v for k, v in (s.get("dores") or {}).items() if v}
            sessoes.append(SessaoPayload(**s).model_dump(mode="json"))
        rascunhos = {k: v for k, v in payload.rascunhos.items() if k in ITENS and isinstance(v, dict)}
    except ValidationError as erro:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Backup invalido: {erro.errors()[0]['msg']}")
    inicio = cfg.inicio or (min((s["data"] for s in sessoes), default=None)) or date.today().isoformat()
    repo.substituir_tudo(cfg.semana_padrao, inicio, cfg.respondidos, fichas, sessoes, rascunhos)
    return {"sessoes": len(sessoes), "fichas": len(fichas)}
