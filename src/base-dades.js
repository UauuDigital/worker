// Connexió a Postgres (Supabase, pooler en mode transacció) amb `pg`.
//
// Dates: Prisma desa els DateTime com a `timestamp without time zone` en UTC.
//  - Lectura: `pg` interpretaria aquests valors amb l'hora LOCAL del procés. El parser
//    de sota els llegeix sempre com a UTC, sigui quina sigui la zona del servidor.
//  - Escriptura: cap `Date` viatja cap a la BD. Tots els instants ("ara", bloquejos,
//    backoff) es calculen dins de SQL amb `now() AT TIME ZONE 'UTC'`; així el rellotge
//    del hosting ni la seva zona horària hi intervenen.
//  - Cap sentència amb nom (PREPARE) ni estat de sessió: compatible amb el mode transacció.
const { Pool, types } = require('pg');

const OID_TIMESTAMP = 1114;

// '2026-10-21 10:00:00.123' (UTC, sense zona) -> Date correcte.
function parsejaTimestampUtc(valor) {
  return new Date(`${valor.replace(' ', 'T')}Z`);
}

const tipus = {
  getTypeParser: (oid, format) => (oid === OID_TIMESTAMP ? parsejaTimestampUtc : types.getTypeParser(oid, format)),
};

function creaBd(urlBd, log) {
  const host = new URL(urlBd).hostname;
  const local = host === 'localhost' || host === '127.0.0.1';
  const pool = new Pool({
    connectionString: urlBd,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    query_timeout: 15_000,
    // El pooler de Supabase usa un certificat que Node no verifica amb les CA del sistema.
    ssl: local ? false : { rejectUnauthorized: false },
    types: tipus,
  });
  pool.on('error', (err) => log.avis('Error en una connexió inactiva de la base de dades', err));
  return {
    pool,
    query: (text, params) => pool.query(text, params),
    tanca: () => pool.end(),
  };
}

module.exports = { creaBd, parsejaTimestampUtc, tipus };
