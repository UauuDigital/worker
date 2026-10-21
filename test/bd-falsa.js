// BD falsa per al panell: respon amb dades fixes segons la sentència SQL. No és Postgres.
function creaBdFalsa(dades = {}) {
  const ara = Date.now();
  const resum = {
    enviatsAvui: 12, enviats24h: 31, enviats7d: 204, pendentsAra: 0, programats: 3, reintentant: 0, enviant: 0,
    cancelats24h: 1, minutsPendentMesAntic: null, segonsEnviantMesAntic: null, ultimEnviatAt: new Date(ara - 4 * 60_000),
    ...dades.resum,
  };
  const perHora = dades.perHora || Array.from({ length: 9 }, (_, i) => ({ hora: new Date(Math.floor((ara - i * 3_600_000) / 3_600_000) * 3_600_000), n: (i * 3) % 7 + 1 }));
  const historial = dades.historial || [
    { createdAt: new Date(ara - 4 * 60_000), destinatariEmail: 'maria@exemple.com', assumpte: 'Benvinguda', estat: 'ENVIAT', intents: 1, enviatAt: new Date(ara - 4 * 60_000), properIntentAt: new Date(ara), darrerError: null, motiuCancelacio: null },
    { createdAt: new Date(ara - 3_600_000), destinatariEmail: 'joan@exemple.com', assumpte: 'Recordatori <b>visita</b>', estat: 'FALLIT', intents: 1, enviatAt: null, properIntentAt: new Date(ara), darrerError: '550 5.1.1 User unknown', motiuCancelacio: null },
    { createdAt: new Date(ara - 7_200_000), destinatariEmail: 'lead@exemple.com', assumpte: 'Seguiment', estat: 'CANCELAT', intents: 0, enviatAt: null, properIntentAt: new Date(ara), darrerError: null, motiuCancelacio: 'El lead no accepta rebre correus' },
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
