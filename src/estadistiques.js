// Dades del panell: només SELECT sobre `correus_cua` (cap taula nova, cap escriptura).
// Mai es llegeix `cosHtml` ni `cosText`.
const { calculaSemafor } = require('./regles');
const { tradueixErrorSmtp } = require('./missatges-error');

const ESTATS = ['PENDENT', 'ENVIANT', 'ENVIAT', 'FALLIT', 'CANCELAT'];
const MIDA_PAGINA = 50;
const ARA_UTC = "(now() AT TIME ZONE 'UTC')";
// Inici del dia d'avui a Madrid, expressat en UTC (com es desen les dates).
const INICI_DIA_UTC = "((date_trunc('day', now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'UTC')";

const SQL_RESUM = `
  SELECT
    count(*) FILTER (WHERE "estat" = 'ENVIAT' AND "enviatAt" >= ${INICI_DIA_UTC})::int AS "enviatsAvui",
    count(*) FILTER (WHERE "estat" = 'ENVIAT' AND "enviatAt" >= ${ARA_UTC} - interval '24 hours')::int AS "enviats24h",
    count(*) FILTER (WHERE "estat" = 'ENVIAT' AND "enviatAt" >= ${ARA_UTC} - interval '7 days')::int AS "enviats7d",
    count(*) FILTER (WHERE "estat" = 'PENDENT' AND "properIntentAt" <= ${ARA_UTC})::int AS "pendentsAra",
    count(*) FILTER (WHERE "estat" = 'PENDENT' AND "properIntentAt" > ${ARA_UTC})::int AS "programats",
    count(*) FILTER (WHERE "estat" = 'PENDENT' AND "intents" > 0)::int AS "reintentant",
    count(*) FILTER (WHERE "estat" = 'ENVIANT')::int AS "enviant",
    count(*) FILTER (WHERE "estat" = 'CANCELAT' AND "createdAt" >= ${ARA_UTC} - interval '24 hours')::int AS "cancelats24h",
    EXTRACT(EPOCH FROM (${ARA_UTC} - min("properIntentAt") FILTER (WHERE "estat" = 'PENDENT' AND "properIntentAt" <= ${ARA_UTC}))) / 60 AS "minutsPendentMesAntic",
    max("enviatAt") FILTER (WHERE "estat" = 'ENVIAT') AS "ultimEnviatAt"
  FROM "correus_cua"`;

// «Fallits (24 h)»: per la data de l'últim intent.
// No hi ha cap columna updatedAt: es fa servir properIntentAt, que no es toca en passar a FALLIT.
const SQL_FALLITS = `SELECT count(*)::int AS n FROM "correus_cua" WHERE "estat" = 'FALLIT' AND "properIntentAt" >= ${ARA_UTC} - interval '24 hours'`;

const SQL_PER_HORA = `
  SELECT date_trunc('hour', "enviatAt") AS "hora", count(*)::int AS "n"
  FROM "correus_cua"
  WHERE "estat" = 'ENVIAT' AND "enviatAt" >= ${ARA_UTC} - interval '24 hours'
  GROUP BY 1`;

const HORA_MS = 3_600_000;

function creaEstadistiques(bd, estat, config) {
  async function resum() {
    const [r, f, h] = await Promise.all([bd.query(SQL_RESUM), bd.query(SQL_FALLITS), bd.query(SQL_PER_HORA)]);
    const d = r.rows[0];
    const viu = estat.instantani();
    const ara = estat.ara();

    const minutsPendentMesAntic = d.minutsPendentMesAntic === null ? null : Number(d.minutsPendentMesAntic);
    const minutsDesDelBatec = viu.ultimBatec ? (ara - viu.ultimBatec) / 60_000 : null;
    const fallits24h = f.rows[0].n;

    const semafor = calculaSemafor({
      mode: config.mode,
      verifyOk: viu.ultimVerify.ok,
      fallits24h,
      minutsDesDelBatec,
      minutsPendentMesAntic,
      reintentant: d.reintentant,
      llistaBlancaActiva: config.llistaBlanca.length > 0,
    });

    // 24 barres: la darrera és l'hora en curs.
    const horaActual = Math.floor(ara / HORA_MS);
    const perHora = Array.from({ length: 24 }, (_, i) => ({ hora: new Date((horaActual - 23 + i) * HORA_MS).toISOString(), n: 0 }));
    for (const fila of h.rows) {
      const idx = 23 - (horaActual - Math.floor(fila.hora.getTime() / HORA_MS));
      if (idx >= 0 && idx < 24) perHora[idx].n = fila.n;
    }

    return {
      generatAt: new Date(ara).toISOString(),
      semafor,
      mode: config.mode,
      llistaBlanca: { activa: config.llistaBlanca.length > 0, entrades: config.llistaBlanca.length },
      targetes: {
        enviatsAvui: d.enviatsAvui, enviats24h: d.enviats24h, enviats7d: d.enviats7d,
        pendentsAra: d.pendentsAra, programats: d.programats, reintentant: d.reintentant, enviant: d.enviant,
        fallits24h, cancelats24h: d.cancelats24h, minutsPendentMesAntic,
        ultimEnviatAt: d.ultimEnviatAt ? d.ultimEnviatAt.toISOString() : null,
      },
      proces: {
        segonsEnMarxa: Math.floor((ara - viu.arrencatAt) / 1000),
        ultimBatecAt: viu.ultimBatec ? new Date(viu.ultimBatec).toISOString() : null,
        ultimVerify: {
          ok: viu.ultimVerify.ok,
          at: viu.ultimVerify.at ? new Date(viu.ultimVerify.at).toISOString() : null,
          missatge: viu.ultimVerify.missatge,
        },
        ultimResultat: viu.ultimResultat ? { tipus: viu.ultimResultat.tipus, at: new Date(viu.ultimResultat.at).toISOString() } : null,
        errorsRecents: viu.errorsRecents.slice(0, 5).map((e) => ({ at: new Date(e.at).toISOString(), missatge: e.missatge })),
      },
      perHora,
    };
  }

  async function historial({ pagina = 1, estat: filtreEstat = null, cerca = '' } = {}) {
    const p = Math.max(1, Math.floor(Number(pagina)) || 1);
    const estatValid = ESTATS.includes(filtreEstat) ? filtreEstat : null;
    const text = String(cerca || '').trim().slice(0, 100);
    const patro = text ? `%${text.replace(/[\\%_]/g, '\\$&')}%` : null;

    const r = await bd.query(
      `SELECT "createdAt", "destinatariEmail", "assumpte", "estat"::text AS "estat", "intents", "enviatAt",
              "properIntentAt", "darrerError", "motiuCancelacio", count(*) OVER()::int AS "total"
       FROM "correus_cua"
       WHERE ($1::text IS NULL OR "estat"::text = $1) AND ($2::text IS NULL OR "destinatariEmail" ILIKE $2)
       ORDER BY "createdAt" DESC, "id" DESC
       LIMIT ${MIDA_PAGINA} OFFSET $3`,
      [estatValid, patro, (p - 1) * MIDA_PAGINA],
    );

    const files = r.rows.map((x) => ({
      creatAt: x.createdAt.toISOString(),
      destinatari: x.destinatariEmail,
      assumpte: x.assumpte,
      estat: x.estat,
      intents: x.intents,
      enviatAt: x.enviatAt ? x.enviatAt.toISOString() : null,
      properIntentAt: x.properIntentAt ? x.properIntentAt.toISOString() : null,
      // L'error tècnic original no surt mai de la BD cap al navegador.
      motiu: x.estat === 'CANCELAT' ? x.motiuCancelacio : tradueixErrorSmtp(x.darrerError),
    }));
    const total = r.rows.length ? r.rows[0].total : 0;
    return { pagina: p, midaPagina: MIDA_PAGINA, total, pagines: Math.max(1, Math.ceil(total / MIDA_PAGINA)), files };
  }

  return { resum, historial };
}

module.exports = { creaEstadistiques, ESTATS, MIDA_PAGINA };
