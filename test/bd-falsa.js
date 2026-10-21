// BD falsa per al panell: respon amb dades fixes segons la sentència SQL. No és Postgres.
function creaBdFalsa(dades = {}) {
  const ara = Date.now();
  const resum = {
    enviatsAvui: 12, enviats24h: 31, enviats7d: 204, pendentsAra: 0, programats: 3, reintentant: 0, enviant: 1,
    cancelats24h: 1, minutsPendentMesAntic: null, segonsEnviantMesAntic: 40, ultimEnviatAt: new Date(ara - 4 * 60_000),
    ...dades.resum,
  };
  const perHora = dades.perHora || Array.from({ length: 9 }, (_, i) => ({ hora: new Date(Math.floor((ara - i * 3_600_000) / 3_600_000) * 3_600_000), n: (i * 3) % 7 + 1 }));
  const m = (min) => new Date(ara - min * 60_000);
  const base = { enviatAt: null, properIntentAt: m(0), bloquejatFins: null, darrerError: null, motiuCancelacio: null, workerId: null, teAuditoria: false };
  const historial = dades.historial || [
    { ...base, id: 'f1', createdAt: m(1), destinatariEmail: 'lucia.ferrer@exemple.com', assumpte: 'Hola! Hem rebut la teva consulta', estat: 'ENVIANT', intents: 1, bloquejatFins: new Date(ara + 4 * 60_000 + 20_000) },
    { ...base, id: 'f2', createdAt: m(4), destinatariEmail: 'maria@exemple.com', assumpte: 'Hola! Hem rebut la teva consulta', estat: 'ENVIAT', intents: 1, enviatAt: m(4), workerId: 'servatica', teAuditoria: true },
    { ...base, id: 'f3', createdAt: m(35), destinatariEmail: 'joan@exemple.com', assumpte: 'Recordatori <b>visita</b>', estat: 'FALLIT', intents: 1, darrerError: '550 5.1.1 User unknown', workerId: 'servatica', teAuditoria: true },
    { ...base, id: 'f4', createdAt: m(50), destinatariEmail: 'pau.serra@exemple.com', assumpte: 'Hola! Hem rebut la teva consulta', estat: 'PENDENT', intents: 2, darrerError: 'Connection timeout', properIntentAt: new Date(ara + 28 * 60_000) },
    { ...base, id: 'f5', createdAt: m(130), destinatariEmail: 'lead@exemple.com', assumpte: 'Seguiment', estat: 'CANCELAT', intents: 0, motiuCancelacio: 'El lead no accepta rebre correus', workerId: 'antic', teAuditoria: true },
    { ...base, id: 'f6', createdAt: m(1500), destinatariEmail: 'anna.puig@exemple.com', assumpte: 'Hola! Hem rebut la teva consulta', estat: 'ENVIAT', intents: 1, enviatAt: m(1500), teAuditoria: true },
  ];
  const consultes = [];

  return {
    consultes,
    async query(text, params) {
      consultes.push({ text, params });
      if (dades.error) throw dades.error;
      if (text.includes('"enviatsAvui"')) return { rows: [resum] };
      if (text.includes('AS n FROM "correus_cua"')) return { rows: [{ n: dades.fallits24h ?? 0 }] };
      if (text.includes("date_trunc('hour'")) return { rows: perHora };
      if (text.includes('OVER()')) return { rows: historial.map((h) => ({ ...h, total: historial.length })) };
      return { rows: [], rowCount: 0 };
    },
    tanca: async () => {},
  };
}

module.exports = { creaBdFalsa };
