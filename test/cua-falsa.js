// Cua en memòria amb la mateixa interfície que src/cua.js (per provar el motor sense Postgres).
function creaCuaFalsa({ correus = [], leads = {}, automatitzacions = {} } = {}) {
  const files = correus.map((c, i) => ({
    id: `c${i + 1}`, estat: 'PENDENT', intents: 0, leadId: null, automatitzacioId: null,
    destinatariNom: null, assumpte: 'Hola', cosHtml: '<p>Hola</p>', cosText: 'Hola',
    properIntentAt: 0, darrerError: null, motiuCancelacio: null, messageId: null, backoffMinuts: null,
    ...c,
  }));
  const auditoria = [];
  const troba = (id) => files.find((f) => f.id === id);
  const audita = (c, action) => auditoria.push({ id: c.id, action });

  return {
    files, auditoria,
    async reservaSeguent() {
      const f = files.filter((x) => x.estat === 'PENDENT' && x.properIntentAt <= Date.now())
        .sort((a, b) => a.properIntentAt - b.properIntentAt)[0];
      if (!f) return null;
      f.estat = 'ENVIANT';
      f.intents += 1;
      return { ...f };
    },
    async alliberaCaducats() { return 0; },
    async marcaEnviat(c, messageId) { Object.assign(troba(c.id), { estat: 'ENVIAT', messageId, darrerError: null }); audita(c, 'CORREU_ENVIAT'); },
    async marcaCancelat(c, motiu) { Object.assign(troba(c.id), { estat: 'CANCELAT', motiuCancelacio: motiu }); audita(c, 'CORREU_CANCELAT'); },
    async marcaFallit(c, err) { Object.assign(troba(c.id), { estat: 'FALLIT', darrerError: err }); audita(c, 'CORREU_FALLIT'); },
    async reprogramaReintent(id, err, minuts) {
      Object.assign(troba(id), { estat: 'PENDENT', darrerError: err, backoffMinuts: minuts, properIntentAt: Date.now() + minuts * 60_000 });
    },
    async leadAcceptaCorreus(leadId) { return leads[leadId] ? leads[leadId].acceptaCorreus !== false : true; },
    async estatLeadPermet(automId, leadId) {
      const a = automatitzacions[automId]; const l = leads[leadId];
      if (!a || !l || !a.estatsLead || a.estatsLead.length === 0) return true;
      return a.estatsLead.includes(l.estat);
    },
  };
}

module.exports = { creaCuaFalsa };
