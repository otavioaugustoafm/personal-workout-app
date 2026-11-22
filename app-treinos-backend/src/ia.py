"""Análises escritas pela IA (API do Claude), a partir dos seus treinos, do sono e da recuperação.

- A chave da Anthropic fica só na Lambda da API (ANTHROPIC_API_KEY).
- Cada análise é guardada no banco: abrir de novo não gasta nada.
- Teto de gasto do mês: as automáticas param em IA_LIMITE_AUTO_USD (1,80) e as que você pede em IA_LIMITE_USD (2,00).
  O limite de gasto no console da Anthropic é a trava final.
"""
from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone

import requests
from psycopg.rows import dict_row

from src.database import get_db_connection

BRASILIA = timezone(timedelta(hours=-3))
URL = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/") + "/v1/messages"

MODELO_RAPIDO = os.getenv("IA_MODELO_RAPIDO", "claude-haiku-5-5").strip()
MODELO_TREINO = os.getenv("IA_MODELO_TREINO", "claude-haiku-5-5").strip()
MODELO = os.getenv("IA_MODELO", "claude-sonnet-5-5").strip()
LIMITE_AUTO = float(os.getenv("IA_LIMITE_AUTO_USD", "1.80"))
LIMITE = float(os.getenv("IA_LIMITE_USD", "2.00"))

# US$ por milhão de tokens (entrada, saída). Confira na página de preços da Anthropic se mudar.
PRECOS = {
    "claude-haiku-5-5": (0.10, 0.50),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-opus-5-5": (4.00, 20.00),
}

TIPOS = {
    # tipo: (modelo, esforço, o que pedir). Os modelos 5.5 sempre "pensam" antes de responder e esse raciocínio
    # conta como saída: o esforço controla quanto ele pensa (e o custo). max_tokens fica folgado (só se paga o usado).
    "prontidao": (MODELO_RAPIDO, "medium", """Analise a PRONTIDÃO DE HOJE ({chave}).
Comece com uma frase que diga como ele está e por quê, citando os números que mais pesaram (compare com a média e a faixa dele).
Depois, em 2 a 4 tópicos, diga exatamente o que fazer com o treino planejado de hoje: manter, aliviar ou trocar; para musculação,
cargas e séries concretas a partir do último treino dessa ficha (quais exercícios subir, manter ou reduzir); para cardio, zona ou
limite de FC, ritmo e distância. Se algo pede atenção (dor recente, sono ruim seguido, carga subindo rápido), um tópico só para isso.
Até 140 palavras."""),
    "treino": (MODELO_TREINO, "medium", """Analise o TREINO {chave} (o primeiro da lista "Treino analisado").
Compare com as vezes anteriores da mesma ficha ou modalidade, com números: o que progrediu, o que caiu ou travou.
Relacione com o sono, o HRV e a Body Battery da noite anterior e com dores, quando houver relação clara.
Termine com 2 a 3 sugestões concretas para a próxima vez dessa ficha/modalidade (exercício, carga, reps; ou ritmo, FC, distância).
Até 200 palavras."""),
    "semana": (MODELO, "medium", """Faça a REVISÃO DA SEMANA que começa em {chave}.
Cubra: o que foi feito contra a semana padrão; carga de musculação e quilometragem contra as semanas anteriores; sono, HRV,
Body Battery e FC de repouso e a tendência; dores; e os padrões que aparecem ao cruzar esses dados (ex.: rendimento depois de
noites ruins). Termine com um plano de ajustes concreto para a próxima semana. Até 320 palavras."""),
    "musculacao": (MODELO, "low", """Analise a MUSCULAÇÃO das últimas 8 semanas.
Por exercício, quem está progredindo, estagnado ou caindo (com cargas e datas). Aponte desequilíbrios entre as fichas,
exercícios pulados com frequência e relação com dores. Termine com as 3 prioridades para as próximas 2 semanas, com cargas-alvo.
Até 280 palavras."""),
    "cardio": (MODELO, "low", """Analise o CARDIO das últimas 12 semanas (corrida, bike, natação).
Volume semanal e progressão (alerta se subir rápido demais), ritmo e eficiência (velocidade por batimento), evolução do longão,
joelho, e a relação com sono e recuperação. Termine com o que ajustar nas próximas 2 semanas. Até 280 palavras."""),
    "sono": (MODELO, "low", """Analise SONO E RECUPERAÇÃO das últimas 8 semanas.
Padrões de duração, fases, nota, HRV, Body Battery e FC de repouso; como os treinos afetam a noite seguinte (ex.: depois de perna
ou de longão) e como as noites afetam o rendimento no dia seguinte. Termine com 3 recomendações práticas. Até 280 palavras."""),
}

SISTEMA = """Você é o treinador pessoal de um atleta amador, analisando os dados dele de um app de treinos e do relógio Garmin.
Escreva em português do Brasil, direto, como um treinador que conhece o atleta. Fale com ele em segunda pessoa ("você").

Regras:
- Use SEMPRE os números dos dados (cargas, datas, km, ritmo, horas de sono, HRV) e compare com o histórico DELE, não com médias da população.
- Nada genérico ou óbvio ("hidrate-se", "durma bem", "ouça seu corpo"): só diga algo se os dados mostram.
- Se os dados forem poucos para concluir algo, diga isso numa frase em vez de inventar.
- Respeite as regras e objetivos do atleta abaixo (ex.: proteger o joelho). Não sugira nada que as contradiga.
- Dor que "doeu" é sinal de alerta; "incomodou" é algo a observar. Não faça diagnóstico médico; se uma dor se repete, sugira avaliação.
- Formato: parágrafos curtos e tópicos com "- ". Pode usar **negrito** em poucas palavras. Sem títulos, sem tabelas, sem emojis.

Como ler os dados:
- Séries: "30×10" = 30 kg × 10 repetições; "aq" = aquecimento; "F" = feeder (aproximação); "12+15" = bi-set (reps de cada exercício).
- A carga é o número que ele anota (por halter ou total, sempre do mesmo jeito para cada exercício).
- Prontidão: nota 0–100 calculada pelo app (sono, HRV contra a faixa dele, Body Battery, FC de repouso contra a média, carga dos últimos
  7 dias contra a média de 4 semanas). "efeito" = efeito aeróbico do treino na escala do Garmin (0–5).

Sobre o atleta:
{contexto}"""

DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]
NOMES_ITEM = {"A": "Peito e Tríceps", "B": "Costas e Bíceps", "C": "Ombro e Antebraço", "D": "Perna", "RQ": "Corrida de qualidade",
              "RL": "Corrida leve", "LG": "Longão", "BK": "Bike indoor Z2", "BI": "Bike intervalada", "BR": "Bike de rua",
              "NT": "Natação", "OFF": "Descanso"}
NIVEL = {"leve": "incomodou", "dor": "doeu"}


# ---------------------------------------------------------------- formatação compacta dos dados

def _h(seg) -> str:
    if not seg:
        return "—"
    seg = int(seg)
    return f"{seg // 3600}h{(seg % 3600) // 60:02d}"


def _dur(seg) -> str:
    if not seg:
        return "—"
    seg = int(seg)
    h, m, s = seg // 3600, (seg % 3600) // 60, seg % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def _kg(n) -> str:
    n = float(n or 0)
    return str(int(n)) if n == int(n) else f"{n:.1f}".replace(".", ",")


def _dia(iso: str) -> str:
    return f"{iso} {DIAS[date.fromisoformat(iso).weekday()]}"


def linha_saude(r: dict) -> str:
    p = []
    s = r.get("sono") or {}
    if s:
        fases = ", ".join(f"{n} {_h(s.get(k))}" for k, n in (("profundo", "prof"), ("rem", "REM")) if s.get(k))
        p.append(f"sono {_h(s.get('seg'))}" + (f" ({fases}" + (f", nota {s['nota']}" if s.get("nota") is not None else "")
                                                + (f", {s['despertares']} despertares" if s.get("despertares") else "") + ")" if fases else ""))
    hv = r.get("hrv") or {}
    if hv.get("noite"):
        p.append(f"HRV {hv['noite']}" + (f" (faixa {hv['faixa_min']}–{hv['faixa_max']}, {hv.get('status', '').lower()})" if hv.get("faixa_min") else ""))
    rs = r.get("resumo") or {}
    if rs.get("bb_max") is not None:
        p.append(f"Body Battery máx {rs['bb_max']}" + (f" (+{rs['bb_carregou']}/−{rs['bb_gastou']})" if rs.get("bb_carregou") is not None else ""))
    if rs.get("fc_repouso"):
        p.append(f"FC repouso {rs['fc_repouso']}")
    if rs.get("estresse"):
        p.append(f"estresse {rs['estresse']}")
    pr = r.get("prontidao") or {}
    if pr.get("nota") is not None:
        p.append(f"prontidão {pr['nota']}")
    return f"{_dia(r['data'])}: " + (" · ".join(p) if p else "sem dados")


def _series(e: dict) -> str:
    out = []
    for x in e.get("series") or []:
        pre = "aq " if x.get("t") == "A" else "F " if x.get("t") == "F" else ""
        out.append(pre + (f"{x.get('reps', 0)}+{x.get('reps2', 0)}" if e.get("biset") else f"{_kg(x.get('kg'))}×{x.get('reps', 0)}"))
    return ", ".join(out)


def linha_sessao(s: dict, detalhe: bool = True) -> str:
    nome = NOMES_ITEM.get(s["item"], s["item"])
    g = s.get("garmin") or {}
    cab = [f"{_dia(s['data'])} · {nome}"]
    if s["tipo"] == "cardio":
        c = s.get("cardio") or {}
        if c.get("dist"):
            dist = f"{round(c['dist'] * 1000)} m" if s["item"] == "NT" else f"{c['dist']:.2f} km".replace(".", ",")
            cab.append(dist)
        if c.get("dur_s"):
            cab.append(_dur(c["dur_s"]))
            if c.get("dist"):
                cab.append(f"{_dur(c['dur_s'] / c['dist'])}/km" if s["item"] in ("RQ", "RL", "LG") else f"{c['dist'] / (c['dur_s'] / 3600):.1f} km/h")
        if c.get("fc"):
            cab.append(f"FC {c['fc']}" + (f"/{g['fc_max']}" if g.get("fc_max") else ""))
        if g.get("cadencia"):
            cab.append(f"cadência {g['cadencia']}")
    else:
        if g.get("dur_s"):
            cab.append(f"{round(g['dur_s'] / 60)} min" + (f", FC {g['fc']}" if g.get("fc") else ""))
        vol = sum((x.get("kg") or 0) * (x.get("reps") or 0) + (x.get("kg2") or 0) * (x.get("reps2") or 0)
                  for e in s.get("exercicios") or [] if not (e.get("pulado") or e.get("semNota") or e.get("aConfirmar"))
                  for x in e.get("series") or [] if x.get("t") == "S")
        if vol:
            cab.append(f"volume {round(vol)} kg")
    if g.get("te_aerobico"):
        cab.append(f"efeito {g['te_aerobico']}")
    dores = [f"{k} {NIVEL[v]}" for k, v in (s.get("dores") or {}).items() if v in NIVEL]
    if dores:
        cab.append("dores: " + ", ".join(dores))
    if s.get("sensacao"):
        cab.append(f"sensação {s['sensacao']}")
    if s.get("rapido"):
        cab.append("marcado como feito, sem anotação")
    txt = " · ".join(cab)
    if s.get("notas"):
        txt += f' · nota: "{s["notas"][:160]}"'
    if detalhe and s["tipo"] == "forca":
        for e in s.get("exercicios") or []:
            st = "pulado" if e.get("pulado") else "sem anotação" if e.get("semNota") or e.get("aConfirmar") else _series(e)
            txt += f"\n    {e.get('nome')}{' (' + e['varNome'] + ')' if e.get('varNome') else ''}: {st}"
    return txt


# ---------------------------------------------------------------- dados

def _carregar(desde: date) -> dict:
    with get_db_connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT semana_padrao, contexto_ia FROM configuracao WHERE id = 1")
        cfg = cur.fetchone() or {}
        cur.execute("SELECT * FROM sessoes WHERE data >= %s ORDER BY data, criado_em", (desde,))
        sessoes = [{**r, "data": r["data"].isoformat()} for r in cur.fetchall()]
        cur.execute("SELECT data, sono, hrv, resumo, prontidao FROM saude_diaria WHERE data >= %s ORDER BY data", (desde,))
        saude = [{**r, "data": r["data"].isoformat()} for r in cur.fetchall()]
    return {"padrao": cfg.get("semana_padrao") or [], "contexto": cfg.get("contexto_ia") or "", "sessoes": sessoes, "saude": saude}


def _padrao(d: dict) -> str:
    return "Semana padrão: " + ", ".join(f"{DIAS[i]} {NOMES_ITEM.get(x, x)}" for i, x in enumerate(d["padrao"]))


def montar_contexto(tipo: str, chave: str, hoje: date) -> str:
    """Só os dados que cada análise precisa, em texto compacto (gasta poucos tokens)."""
    partes: list[str] = [f"Hoje é {_dia(hoje.isoformat())}."]
    if tipo == "prontidao":
        dia = date.fromisoformat(chave)
        d = _carregar(dia - timedelta(days=60))
        partes.append(_padrao(d))
        plan = [d["padrao"][(dia + timedelta(days=i)).weekday()] for i in range(3)] if d["padrao"] else []
        if plan:
            partes.append(f"Planejado: hoje {NOMES_ITEM.get(plan[0])}, amanhã {NOMES_ITEM.get(plan[1])}, depois {NOMES_ITEM.get(plan[2])}.")
        hj = next((r for r in d["saude"] if r["data"] == chave), None)
        if hj and hj.get("prontidao"):
            p = hj["prontidao"]
            partes.append(f"Prontidão de hoje: {p['nota']} ({p['faixa']}). " + "; ".join(f"{v['nome']} {v['nota']} ({v['txt']})" for v in p["partes"].values()))
        partes.append("Recuperação (14 dias):\n" + "\n".join(linha_saude(r) for r in d["saude"] if r["data"] >= (dia - timedelta(days=14)).isoformat()))
        partes.append("Treinos (14 dias):\n" + "\n".join(linha_sessao(s) for s in d["sessoes"] if s["data"] >= (dia - timedelta(days=14)).isoformat()))
        if plan and plan[0] in ("A", "B", "C", "D", "RQ", "RL", "LG", "BK", "BI"):
            ult = [s for s in d["sessoes"] if s["item"] == plan[0] and s["data"] < (dia - timedelta(days=14)).isoformat()][-2:]
            if ult:
                partes.append(f"Vezes anteriores de {NOMES_ITEM[plan[0]]}:\n" + "\n".join(linha_sessao(s) for s in ult))
    elif tipo == "treino":
        d = _carregar(hoje - timedelta(days=120))
        s = next((x for x in d["sessoes"] if x["id"] == chave), None)
        if not s:
            raise ValueError("Treino não encontrado.")
        dia = date.fromisoformat(s["data"])
        partes.append("Treino analisado:\n" + linha_sessao(s))
        ant = [x for x in d["sessoes"] if x["item"] == s["item"] and x["id"] != s["id"] and x["data"] <= s["data"]][-4:]
        partes.append("Vezes anteriores do mesmo treino:\n" + ("\n".join(linha_sessao(x) for x in ant) or "nenhuma"))
        partes.append("Recuperação nos dias em volta:\n" + "\n".join(linha_saude(r) for r in d["saude"] if (dia - timedelta(days=3)).isoformat() <= r["data"] <= (dia + timedelta(days=1)).isoformat()))
        partes.append("Outros treinos da semana anterior:\n" + "\n".join(linha_sessao(x, False) for x in d["sessoes"] if (dia - timedelta(days=7)).isoformat() <= x["data"] <= s["data"] and x["id"] != s["id"]))
    elif tipo == "semana":
        ini = date.fromisoformat(chave)
        d = _carregar(ini - timedelta(days=28))
        partes.append(_padrao(d))
        fim = (ini + timedelta(days=6)).isoformat()
        partes.append("Treinos da semana:\n" + ("\n".join(linha_sessao(s) for s in d["sessoes"] if chave <= s["data"] <= fim) or "nenhum"))
        partes.append("3 semanas anteriores (resumo):\n" + "\n".join(linha_sessao(s, False) for s in d["sessoes"] if s["data"] < chave))
        partes.append("Recuperação (4 semanas + esta):\n" + "\n".join(linha_saude(r) for r in d["saude"] if r["data"] <= fim))
    elif tipo == "musculacao":
        d = _carregar(hoje - timedelta(days=56))
        partes.append("Treinos de musculação (8 semanas):\n" + "\n".join(linha_sessao(s) for s in d["sessoes"] if s["tipo"] == "forca"))
        partes.append("Recuperação, só a prontidão por dia:\n" + ", ".join(f"{r['data'][5:]} {r['prontidao']['nota']}" for r in d["saude"] if r.get("prontidao")))
    elif tipo == "cardio":
        d = _carregar(hoje - timedelta(days=84))
        partes.append(_padrao(d))
        partes.append("Treinos de cardio (12 semanas):\n" + "\n".join(linha_sessao(s) for s in d["sessoes"] if s["tipo"] == "cardio"))
        partes.append("Dias de perna (para a regra do joelho): " + ", ".join(s["data"] for s in d["sessoes"] if s["item"] == "D"))
        partes.append("Recuperação (8 semanas):\n" + "\n".join(linha_saude(r) for r in d["saude"] if r["data"] >= (hoje - timedelta(days=56)).isoformat()))
    elif tipo == "sono":
        d = _carregar(hoje - timedelta(days=56))
        partes.append("Recuperação (8 semanas):\n" + "\n".join(linha_saude(r) for r in d["saude"]))
        partes.append("Treinos (8 semanas, resumo):\n" + "\n".join(linha_sessao(s, False) for s in d["sessoes"]))
    else:
        raise ValueError("Tipo de análise desconhecido.")
    return "\n\n".join(partes), d["contexto"]


# ---------------------------------------------------------------- gasto e chamada

def custo(modelo: str, tin: int, tout: int) -> float:
    pin, pout = PRECOS.get(modelo, PRECOS["claude-sonnet-5-5"])
    if modelo == "claude-haiku-5-5" and tin > 100_000:  # faixa de prompts longos do Haiku
        pin, pout = 0.50, 2.50
    return (tin * pin + tout * pout) / 1_000_000


def gasto_do_mes() -> float:
    with get_db_connection() as conn:
        r = conn.execute("""SELECT COALESCE(SUM(custo_usd), 0) FROM analises_ia
                            WHERE criado_em >= date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'""").fetchone()
    return float(r[0])


def configurada() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY", "").strip())


class LimiteAtingido(Exception):
    pass


def _chamar(modelo: str, esforco: str, sistema: str, conteudo: str) -> tuple[str, int, int]:
    r = requests.post(URL, timeout=55, headers={
        "x-api-key": os.environ["ANTHROPIC_API_KEY"].strip(),
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }, json={"model": modelo, "max_tokens": 16000, "output_config": {"effort": esforco},
             "system": sistema, "messages": [{"role": "user", "content": conteudo}]})
    if r.status_code != 200:
        try:
            msg = r.json().get("error", {}).get("message", "")
        except ValueError:
            msg = r.text[:200]
        raise RuntimeError(f"API do Claude respondeu {r.status_code}: {msg[:200]}")
    corpo = r.json()
    texto = "".join(b.get("text", "") for b in corpo.get("content", []) if b.get("type") == "text").strip()
    u = corpo.get("usage") or {}
    if not texto:
        raise RuntimeError(f"A IA não devolveu texto (parou por: {corpo.get('stop_reason')}). Tente de novo.")
    return texto, int(u.get("input_tokens") or 0), int(u.get("output_tokens") or 0)


def analisar(tipo: str, chave: str, forcar: bool = False, auto: bool = False, chamar=None) -> dict:
    """Devolve a análise guardada, ou gera uma nova (respeitando o teto do mês)."""
    if tipo not in TIPOS:
        raise ValueError("Tipo de análise desconhecido.")
    if not forcar:
        with get_db_connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute("SELECT * FROM analises_ia WHERE tipo = %s AND chave = %s", (tipo, chave))
            r = cur.fetchone()
            if r and r["texto"].strip():
                return analise_para_api(r)
    gasto = gasto_do_mes()
    if gasto >= (LIMITE_AUTO if auto else LIMITE):
        raise LimiteAtingido(f"Teto do mês atingido (US$ {gasto:.2f}).")
    modelo, esforco, pedido = TIPOS[tipo]
    hoje = datetime.now(BRASILIA).date()
    dados, contexto = montar_contexto(tipo, chave, hoje)
    sistema = SISTEMA.format(contexto=contexto.strip() or "(sem descrição)")
    texto, tin, tout = (chamar or _chamar)(modelo, esforco, sistema, f"{pedido.format(chave=chave)}\n\nDados:\n{dados}")
    c = custo(modelo, tin, tout)
    with get_db_connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """INSERT INTO analises_ia (tipo, chave, modelo, texto, tokens_in, tokens_out, custo_usd)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (tipo, chave) DO UPDATE SET modelo = EXCLUDED.modelo, texto = EXCLUDED.texto,
                 tokens_in = analises_ia.tokens_in + EXCLUDED.tokens_in, tokens_out = analises_ia.tokens_out + EXCLUDED.tokens_out,
                 custo_usd = analises_ia.custo_usd + EXCLUDED.custo_usd, criado_em = now()
               RETURNING *""",
            (tipo, chave, modelo, texto, tin, tout, c),
        )
        return analise_para_api(cur.fetchone())


def analise_para_api(r: dict) -> dict:
    return {"tipo": r["tipo"], "chave": r["chave"], "modelo": r["modelo"], "texto": r["texto"],
            "custo_usd": float(r["custo_usd"]), "criado_em": r["criado_em"].isoformat()}


def ler_ia() -> dict:
    with get_db_connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT * FROM analises_ia WHERE criado_em >= now() - interval '120 days' ORDER BY criado_em")
        analises = [analise_para_api(r) for r in cur.fetchall()]
    return {"analises": analises, "gasto_mes": round(gasto_do_mes(), 4), "limite_auto": LIMITE_AUTO, "limite": LIMITE, "configurada": configurada()}
