"""Modelos de entrada da API e as regras de validacao comuns."""
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

ITENS = ("A", "B", "C", "D", "RQ", "RL", "LG", "BK", "BI", "BR", "NT", "OFF")
FICHAS = ("A", "B", "C", "D")
Item = Literal["A", "B", "C", "D", "RQ", "RL", "LG", "BK", "BI", "BR", "NT", "OFF"]
Tipo = Literal["forca", "cardio", "descanso"]
NivelDor = Literal["ok", "leve", "dor"]

TIPO_DO_ITEM = {"A": "forca", "B": "forca", "C": "forca", "D": "forca",
                "RQ": "cardio", "RL": "cardio", "LG": "cardio", "BK": "cardio", "BI": "cardio",
                "BR": "cardio", "NT": "cardio", "OFF": "descanso"}


class ConfiguracaoPayload(BaseModel):
    semana_padrao: list[Item] | None = Field(None, min_length=7, max_length=7)
    inicio: date | None = None
    respondidos: dict[str, Literal["nao"]] | None = None

    @field_validator("respondidos")
    @classmethod
    def _datas(cls, v):
        if v is None:
            return v
        if len(v) > 400:
            raise ValueError("Respostas demais.")
        for chave in v:
            date.fromisoformat(chave)
        return v


class SerieModelo(BaseModel, extra="allow"):
    t: Literal["F", "A", "S"]
    kg: float = Field(0, ge=0, le=1000)
    reps: int = Field(0, ge=0, le=1000)


class Variante(BaseModel, extra="allow"):
    nome: str = Field("", max_length=60)
    series: list[SerieModelo] = Field(..., min_length=1, max_length=20)
    biset: list[str] | None = Field(None, min_length=2, max_length=2)


class Exercicio(BaseModel, extra="allow"):
    id: str = Field(..., min_length=1, max_length=80)
    nome: str = Field(..., min_length=1, max_length=80)
    garmin: str = Field("", max_length=120)
    ajuste: str = Field("", max_length=200)
    manual: bool = False
    variantes: list[Variante] = Field(..., min_length=1, max_length=5)


class FichaPayload(BaseModel):
    exercicios: list[Exercicio] = Field(..., max_length=30)


class SessaoPayload(BaseModel):
    id: str = Field(..., min_length=1, max_length=60)
    data: date
    item: Item
    exercicios: list[dict[str, Any]] | None = Field(None, max_length=30)
    cardio: dict[str, Any] | None = None
    dores: dict[str, NivelDor] = Field(default_factory=dict)
    sensacao: Literal["leve", "ok", "pesado"] | None = None
    notas: str = Field("", max_length=2000)
    rapido: bool = False
    garmin: dict[str, Any] | None = None  # dados extras da atividade do Garmin ligada a esta sessao
    ts: int | None = None  # momento do registro (ms), so para ordenar; o servidor usa o proprio relogio se faltar

    @field_validator("dores")
    @classmethod
    def _dores(cls, v):
        if len(v) > 12:
            raise ValueError("Dores demais.")
        return v


class RascunhoPayload(BaseModel):
    dados: dict[str, Any]
