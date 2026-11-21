"""Leitura e escrita no banco. Tudo do usuario unico; nao ha tabela de usuarios."""
from datetime import datetime, timezone

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from src.database import get_db_connection
from src.modelos import TIPO_DO_ITEM


def _ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def sessao_para_api(r: dict) -> dict:
    """Formato que o front usa (o mesmo da pagina original, para importar backups sem conversao)."""
    s = {
        "id": r["id"], "data": r["data"].isoformat(), "item": r["item"], "kind": r["tipo"],
        "dores": r["dores"] or {}, "sensacao": r["sensacao"], "notas": r["notas"], "rapido": r["rapido"],
        "garmin": r["garmin"], "ts": _ms(r["criado_em"]),
    }
    s["joelho"] = s["dores"].get("joelho")
    if r["exercicios"] is not None:
        s["exercicios"] = r["exercicios"]
    if r["cardio"] is not None:
        s["cardio"] = r["cardio"]
    return s


def ler_estado() -> dict:
    with get_db_connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT semana_padrao, inicio, respondidos FROM configuracao WHERE id = 1")
        cfg = cur.fetchone()
        if cfg is None:
            raise RuntimeError("Tabela configuracao vazia: rode a migracao 001 no Neon.")
        cur.execute("SELECT id, exercicios FROM fichas ORDER BY id")
        fichas = {r["id"]: r["exercicios"] for r in cur.fetchall()}
        cur.execute("SELECT * FROM sessoes ORDER BY data, criado_em")
        sessoes = [sessao_para_api(r) for r in cur.fetchall()]
        cur.execute("SELECT item, dados FROM rascunhos")
        rascunhos = {r["item"]: r["dados"] for r in cur.fetchall()}
        garmin = ler_garmin(cur)
    return {
        "garmin": garmin,
        "padrao": cfg["semana_padrao"], "inicio": cfg["inicio"].isoformat(), "respondidos": cfg["respondidos"] or {},
        "fichas": fichas, "sessoes": sessoes, "rascunhos": rascunhos,
    }


def atualizar_configuracao(semana_padrao=None, inicio=None, respondidos=None) -> None:
    partes, valores = [], []
    if semana_padrao is not None:
        partes.append("semana_padrao = %s"); valores.append(Jsonb(semana_padrao))
    if inicio is not None:
        partes.append("inicio = %s"); valores.append(inicio)
    if respondidos is not None:
        partes.append("respondidos = %s"); valores.append(Jsonb(respondidos))
    if not partes:
        return
    with get_db_connection() as conn:
        conn.execute(f"UPDATE configuracao SET {', '.join(partes)}, atualizado_em = now() WHERE id = 1", valores)


def salvar_ficha(ficha_id: str, exercicios: list) -> None:
    with get_db_connection() as conn:
        conn.execute("UPDATE fichas SET exercicios = %s, atualizado_em = now() WHERE id = %s", (Jsonb(exercicios), ficha_id))


def ler_garmin(cur) -> dict:
    """Atividades do Garmin ainda sem decisão (últimos 60 dias) e a situação da sincronização."""
    cur.execute("""SELECT id, data, tipo, resumo, exercicios FROM garmin_atividades
                   WHERE situacao = 'nova' AND data >= current_date - 60 ORDER BY data, id""")
    atividades = [{"id": str(r["id"]), "data": r["data"].isoformat(), "tipo": r["tipo"], "resumo": r["resumo"],
                   "exercicios": r["exercicios"]} for r in cur.fetchall()]
    cur.execute("SELECT ultima_sync, ultimo_erro, chave_expira FROM garmin_estado WHERE id = 1")
    e = cur.fetchone() or {}
    return {
        "atividades": atividades,
        "ultima_sync": e["ultima_sync"].isoformat() if e.get("ultima_sync") else None,
        "ultimo_erro": e.get("ultimo_erro"),
        "chave_expira": e["chave_expira"].isoformat() if e.get("chave_expira") else None,
    }


def inserir_sessao(conn, s: dict, atualizar: bool = False) -> None:
    criado = datetime.fromtimestamp(s["ts"] / 1000, tz=timezone.utc) if s.get("ts") else datetime.now(timezone.utc)
    conn.execute(
        """INSERT INTO sessoes (id, data, item, tipo, exercicios, cardio, dores, sensacao, notas, rapido, garmin, criado_em)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (id) DO """ + ("""UPDATE SET data = EXCLUDED.data, item = EXCLUDED.item, tipo = EXCLUDED.tipo,
               exercicios = EXCLUDED.exercicios, cardio = EXCLUDED.cardio, dores = EXCLUDED.dores,
               sensacao = EXCLUDED.sensacao, notas = EXCLUDED.notas, rapido = EXCLUDED.rapido, garmin = EXCLUDED.garmin"""
                                        if atualizar else "NOTHING"),
        (s["id"], s["data"], s["item"], TIPO_DO_ITEM[s["item"]],
         Jsonb(s["exercicios"]) if s.get("exercicios") is not None else None,
         Jsonb(s["cardio"]) if s.get("cardio") is not None else None,
         Jsonb(s.get("dores") or {}), s.get("sensacao"), s.get("notas") or "", bool(s.get("rapido")),
         Jsonb(s["garmin"]) if s.get("garmin") else None, criado),
    )


def criar_sessao(s: dict) -> dict:
    with get_db_connection() as conn:
        inserir_sessao(conn, s)
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("SELECT * FROM sessoes WHERE id = %s", (s["id"],))
            return sessao_para_api(cur.fetchone())


_DEVOLVER_GARMIN = "UPDATE garmin_atividades SET situacao = 'nova', sessao_id = NULL WHERE sessao_id = ANY(%s)"


def excluir_sessao(sessao_id: str) -> int:
    """Apagar uma sessão devolve as atividades do Garmin dela para a fila (não se perdem)."""
    with get_db_connection() as conn, conn.transaction():
        conn.execute(_DEVOLVER_GARMIN, ([sessao_id],))
        return conn.execute("DELETE FROM sessoes WHERE id = %s", (sessao_id,)).rowcount


def excluir_sessoes_do_dia(dia) -> int:
    with get_db_connection() as conn, conn.transaction():
        ids = [r[0] for r in conn.execute("SELECT id FROM sessoes WHERE data = %s", (dia,)).fetchall()]
        conn.execute(_DEVOLVER_GARMIN, (ids,))
        return conn.execute("DELETE FROM sessoes WHERE data = %s", (dia,)).rowcount


def usar_atividade_garmin(atividade_id: int, s: dict) -> dict | None:
    """Grava a sessão confirmada (nova ou completada) e marca a atividade como usada, tudo junto."""
    with get_db_connection() as conn, conn.transaction():
        if conn.execute("SELECT 1 FROM garmin_atividades WHERE id = %s", (atividade_id,)).fetchone() is None:
            return None
        inserir_sessao(conn, s, atualizar=True)
        conn.execute("UPDATE garmin_atividades SET situacao = 'usada', sessao_id = %s WHERE id = %s", (s["id"], atividade_id))
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("SELECT * FROM sessoes WHERE id = %s", (s["id"],))
            return sessao_para_api(cur.fetchone())


def ignorar_atividade_garmin(atividade_id: int) -> int:
    with get_db_connection() as conn:
        return conn.execute("UPDATE garmin_atividades SET situacao = 'ignorada' WHERE id = %s", (atividade_id,)).rowcount


def salvar_rascunho(item: str, dados: dict) -> None:
    with get_db_connection() as conn:
        conn.execute(
            """INSERT INTO rascunhos (item, dados) VALUES (%s, %s)
               ON CONFLICT (item) DO UPDATE SET dados = EXCLUDED.dados, atualizado_em = now()""",
            (item, Jsonb(dados)),
        )


def excluir_rascunho(item: str) -> None:
    with get_db_connection() as conn:
        conn.execute("DELETE FROM rascunhos WHERE item = %s", (item,))


def substituir_tudo(padrao, inicio, respondidos, fichas: dict, sessoes: list, rascunhos: dict) -> None:
    """Importacao de backup: troca tudo numa transacao so (se algo falhar, nada muda)."""
    with get_db_connection() as conn:
        with conn.transaction():
            conn.execute("UPDATE configuracao SET semana_padrao = %s, inicio = %s, respondidos = %s, atualizado_em = now() WHERE id = 1",
                         (Jsonb(padrao), inicio, Jsonb(respondidos)))
            for fid, exs in fichas.items():
                conn.execute("UPDATE fichas SET exercicios = %s, atualizado_em = now() WHERE id = %s", (Jsonb(exs), fid))
            conn.execute("DELETE FROM sessoes")
            for s in sessoes:
                inserir_sessao(conn, s)
            conn.execute("DELETE FROM rascunhos")
            for item, dados in rascunhos.items():
                conn.execute("INSERT INTO rascunhos (item, dados) VALUES (%s, %s)", (item, Jsonb(dados)))
