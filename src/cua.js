// SQL sobre la cua de correus. Només les columnes que el worker necessita.
// Taules i columnes són les del CRM (Prisma): camelCase entre cometes; els enums de
// Postgres es diuen "EstatCorreu", "OrigenAuditoria", "EstatLead".
const crypto = require('node:crypto');

const ARA_UTC = "(now() AT TIME ZONE 'UTC')";
const COLUMNES_CORREU = '"id", "leadId", "automatitzacioId", "destinatariEmail", "destinatariNom", "assumpte", "cosHtml", "cosText", "intents"';

function creaCua(bd, log, workerId = null) {
  // Reserva atòmica: FOR UPDATE SKIP LOCKED evita que dos workers agafin el mateix.
  async function reservaSeguent(bloquejaMinuts) {
    const r = await bd.query(
      `UPDATE "correus_cua"
       SET "estat" = 'ENVIANT', "bloquejatFins" = ${ARA_UTC} + make_interval(mins => $1::int), "intents" = "intents" + 1
       WHERE "id" = (
         SELECT "id" FROM "correus_cua"
         WHERE "estat" = 'PENDENT' AND "properIntentAt" <= ${ARA_UTC}
         ORDER BY "properIntentAt" ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING ${COLUMNES_CORREU}`,
      [bloquejaMinuts],
    );
    return r.rows[0] || null;
  }

  // Correus que van quedar ENVIANT per una caiguda del worker.
  async function alliberaCaducats() {
    const r = await bd.query(
      `UPDATE "correus_cua" SET "estat" = 'PENDENT', "bloquejatFins" = NULL
       WHERE "estat" = 'ENVIANT' AND "bloquejatFins" < ${ARA_UTC}`,
    );
    return r.rowCount;
  }

  // Si el registre d'activitat falla, el correu NO es torna a enviar: només es registra l'error.
  async function audita(c, action, resum) {
    try {
      await bd.query(
        `INSERT INTO "audit_logs" ("id", "createdAt", "origen", "targetType", "targetId", "action", "resum", "metadata")
         VALUES ($1, ${ARA_UTC}, $2::"OrigenAuditoria", $3, $4, $5, $6, $7::jsonb)`,
        [
          crypto.randomUUID(), 'AUTOMATIC', c.leadId ? 'Lead' : 'CorreuCua', c.leadId || c.id,
          action, resum, JSON.stringify({ font: 'worker-correus', correuId: c.id, ...(workerId ? { workerId } : {}) }),
        ],
      );
    } catch (err) {
      log.error(`No s'ha pogut registrar l'activitat del correu ${c.id}`, err);
    }
  }

  async function marcaEnviat(c, messageId) {
    await bd.query(
      `UPDATE "correus_cua" SET "estat" = $2::"EstatCorreu", "enviatAt" = ${ARA_UTC}, "messageId" = $3, "bloquejatFins" = NULL, "darrerError" = NULL
       WHERE "id" = $1`,
      [c.id, 'ENVIAT', messageId],
    );
    await audita(c, 'CORREU_ENVIAT', `Correu «${c.assumpte}» enviat a ${c.destinatariEmail}`);
  }

  async function marcaCancelat(c, motiu) {
    await bd.query(
      `UPDATE "correus_cua" SET "estat" = $2::"EstatCorreu", "motiuCancelacio" = $3, "bloquejatFins" = NULL WHERE "id" = $1`,
      [c.id, 'CANCELAT', motiu],
    );
    await audita(c, 'CORREU_CANCELAT', `Correu «${c.assumpte}» per a ${c.destinatariEmail} cancel·lat: ${motiu}`);
  }

  async function marcaFallit(c, errorTecnic) {
    await bd.query(
      `UPDATE "correus_cua" SET "estat" = $2::"EstatCorreu", "darrerError" = $3, "bloquejatFins" = NULL WHERE "id" = $1`,
      [c.id, 'FALLIT', errorTecnic.slice(0, 1000)],
    );
    // L'error tècnic NO va a l'auditoria (només a la cua, per a depuració).
    await audita(c, 'CORREU_FALLIT', `Correu «${c.assumpte}» per a ${c.destinatariEmail}: no s’ha pogut enviar`);
  }

  async function reprogramaReintent(id, errorTecnic, minuts) {
    await bd.query(
      `UPDATE "correus_cua"
       SET "estat" = $2::"EstatCorreu", "darrerError" = $3, "bloquejatFins" = NULL,
           "properIntentAt" = ${ARA_UTC} + make_interval(mins => $4::int)
       WHERE "id" = $1`,
      [id, 'PENDENT', errorTecnic.slice(0, 1000), minuts],
    );
  }

  // L'automatització pot limitar-se a certs estats del lead: es torna a comprovar AL MOMENT D'ENVIAR.
  async function estatLeadPermet(automatitzacioId, leadId) {
    if (!automatitzacioId || !leadId) return true;
    const [regla, lead] = await Promise.all([
      bd.query('SELECT "estatsLead"::text[] AS "estatsLead" FROM "automatitzacions_correu" WHERE "id" = $1', [automatitzacioId]),
      bd.query('SELECT "estat"::text AS "estat" FROM "leads" WHERE "id" = $1', [leadId]),
    ]);
    if (!regla.rows[0] || !lead.rows[0]) return true;
    const estats = regla.rows[0].estatsLead || [];
    return estats.length === 0 || estats.includes(lead.rows[0].estat);
  }

  async function leadAcceptaCorreus(leadId) {
    const r = await bd.query('SELECT "acceptaCorreus" FROM "leads" WHERE "id" = $1', [leadId]);
    return r.rows[0] ? r.rows[0].acceptaCorreus : true;
  }

  return {
    reservaSeguent, alliberaCaducats, marcaEnviat, marcaCancelat, marcaFallit,
    reprogramaReintent, estatLeadPermet, leadAcceptaCorreus,
  };
}

module.exports = { creaCua, ARA_UTC };
