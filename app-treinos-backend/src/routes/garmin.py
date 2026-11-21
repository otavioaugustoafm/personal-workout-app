"""Rotas da Fase 2: o app confirma ou ignora o que veio do Garmin, e pode pedir uma sincronização na hora."""
import json
import os

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from src import repositorio as repo
from src.dependencies import exigir_acesso
from src.modelos import SessaoPayload

router = APIRouter(prefix="/api/v1/garmin", tags=["Garmin"], dependencies=[Depends(exigir_acesso)])


class UsarPayload(BaseModel):
    sessao: SessaoPayload


@router.post("/{atividade_id}/usar")
def usar(atividade_id: int, payload: UsarPayload):
    """Grava a sessão que você confirmou (criada ou completada com o Garmin) e tira a atividade da fila."""
    salva = repo.usar_atividade_garmin(atividade_id, payload.sessao.model_dump(mode="json"))
    if salva is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Atividade do Garmin não encontrada.")
    return salva


@router.post("/{atividade_id}/ignorar", status_code=status.HTTP_204_NO_CONTENT)
def ignorar(atividade_id: int):
    if not repo.ignorar_atividade_garmin(atividade_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Atividade do Garmin não encontrada.")


@router.post("/sincronizar")
def sincronizar():
    """Chama a Lambda de sincronização e espera ela terminar. A chave do Garmin fica só lá."""
    funcao = os.getenv("GARMIN_SYNC_FUNCTION", "").strip()
    if not funcao:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED,
                            detail="Sincronização manual não configurada (GARMIN_SYNC_FUNCTION). A automática continua de hora em hora.")
    import boto3  # já vem na Lambda; localmente só é preciso se você testar esta rota
    resposta = boto3.client("lambda").invoke(FunctionName=funcao, InvocationType="RequestResponse", Payload=b"{}")
    corpo = json.loads(resposta["Payload"].read() or b"{}")
    if resposta.get("FunctionError"):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                            detail="A sincronização com o Garmin falhou: " + str(corpo.get("errorMessage", ""))[:200])
    return corpo
