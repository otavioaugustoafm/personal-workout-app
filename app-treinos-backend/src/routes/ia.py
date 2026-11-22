"""Rotas das análises com IA e da prontidão."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from src import ia
from src.dependencies import exigir_acesso

router = APIRouter(prefix="/api/v1/ia", tags=["IA"], dependencies=[Depends(exigir_acesso)])


class PedidoAnalise(BaseModel):
    chave: str = Field(..., min_length=1, max_length=40)
    forcar: bool = False   # gerar de novo mesmo se já existir
    auto: bool = False     # pedida pelo app sozinho (para no teto automático)


@router.post("/{tipo}")
def analisar(tipo: Literal["prontidao", "treino", "semana", "musculacao", "cardio", "sono"], pedido: PedidoAnalise):
    if not ia.configurada():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="IA não configurada: falta ANTHROPIC_API_KEY na Lambda da API.")
    try:
        analise = ia.analisar(tipo, pedido.chave, pedido.forcar, pedido.auto)
    except ia.LimiteAtingido as e:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(e)) from e
    return {**analise, "gasto_mes": round(ia.gasto_do_mes(), 4)}
