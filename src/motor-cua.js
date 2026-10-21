// Motor de la cua de correus. Mateixa lògica per als dos modes:
//  - bucle(): continu dins del procés (consulta cada 2 s si no hi ha feina).
//  - tick(maxMs): processa durant com a màxim `maxMs` i retorna (cron extern).
// Totes les dependències s'injecten perquè les proves puguin substituir BD i SMTP.
const regles = require('./regles');
const { tradueixErrorSmtp, classificaErrorApi } = require('./missatges-error');
const { missatgeError } = require('./enviament');

const defecteDorm = (ms) => new Promise((r) => setTimeout(r, ms));

function creaMotor({
  cua, enviador, estat, log, config,
  msEntre = regles.MS_ENTRE_ENVIAMENTS, msSenseFeina = 2000,
  dorm = defecteDorm, ara = Date.now,
}) {
  let aturant = false;
  let ocupat = false; // candau en memòria: un sol tick alhora
  let ultimEnviament = 0;

  async function reintenta(fn, vegades = 3) {
    for (let i = 1; ; i++) {
      try { return await fn(); } catch (err) {
        if (i >= vegades) throw err;
        await dorm(500 * i);
      }
    }
  }

  // Retorna true si ha intentat contactar amb el SMTP (compta per al límit de ritme).
  async function processa(c) {
    const motiu = await motiuCancelacio(c);
    if (motiu) {
      await cua.marcaCancelat(c, motiu);
      estat.resultat('cancelat');
      return false;
    }
    try {
      const messageId = await enviador.envia(c);
      // Si això falla, el correu ja ha sortit: es reintenta el desat per no duplicar-lo.
      await reintenta(() => cua.marcaEnviat(c, messageId));
      estat.resultat('enviat');
      log.info(`Enviat ${c.id} (intent ${c.intents})`);
    } catch (err) {
      await gestionaErrorEnviament(c, err);
    }
    return true;
  }

  async function motiuCancelacio(c) {
    if (!regles.permesPerLlistaBlanca(c.destinatariEmail, config.llistaBlanca)) {
      return 'Destinatari fora de la llista blanca (mode desenvolupament)';
    }
    if (c.leadId && !(await cua.leadAcceptaCorreus(c.leadId))) return 'El lead no accepta rebre correus';
    if (!(await cua.estatLeadPermet(c.automatitzacioId, c.leadId))) {
      return 'El lead ja no és en un estat en què s’hagi d’enviar aquest correu';
    }
    return null;
  }

  async function gestionaErrorEnviament(c, err) {
    const msg = missatgeError(err);
    log.error(`Error enviant ${c.id} (intent ${c.intents})`, err);
    estat.afegeixError(tradueixErrorSmtp(msg));
    if (regles.decideixFallit(err, c.intents)) {
      await cua.marcaFallit(c, msg);
      estat.resultat('fallit');
    } else {
      await cua.reprogramaReintent(c.id, msg, regles.minutsBackoff(c.intents));
      estat.resultat('reintent');
    }
  }

  // Un pas: allibera caducats, espera el ritme, reserva i processa.
  // Retorna 'feina' | 'buit'. Amb `fiMs`, no comença res que no es pugui acabar abans.
  async function unPas(fiMs = null, marge = 0) {
    const alliberats = await cua.alliberaCaducats();
    if (alliberats > 0) log.avis(`${alliberats} correu(s) caducats retornats a la cua`);

    const espera = Math.max(0, ultimEnviament + msEntre - ara());
    if (fiMs !== null && ara() + espera + marge > fiMs) return 'limit';
    if (espera > 0) await dorm(espera);

    const correu = await cua.reservaSeguent(regles.BLOQUEIG_MINUTS);
    if (!correu) return 'buit';
    if (await processa(correu)) ultimEnviament = ara();
    return 'feina';
  }

  async function bucle() {
    while (!aturant) {
      estat.batec();
      try {
        if ((await unPas()) === 'buit') await dorm(msSenseFeina);
      } catch (err) {
        log.error('Error al bucle principal', err);
        estat.afegeixError(classificaErrorApi(err).missatge);
        await dorm(msSenseFeina * 2);
      }
    }
  }

  // Mode tick. Pot excedir `maxSegons` només si el SMTP es penja (els timeouts són de 20 s).
  async function tick(maxSegons) {
    if (ocupat) return { ocupat: true, processats: 0 };
    ocupat = true;
    let processats = 0;
    try {
      const fi = ara() + maxSegons * 1000;
      const marge = Math.min(8000, (maxSegons * 1000) / 2);
      estat.batec();
      while (!aturant) {
        const r = await unPas(fi, marge);
        if (r !== 'feina') break;
        processats++;
      }
      return { ocupat: false, processats };
    } catch (err) {
      log.error('Error durant el tick', err);
      estat.afegeixError(classificaErrorApi(err).missatge);
      throw err;
    } finally {
      estat.batec();
      ocupat = false;
    }
  }

  async function comprovaSmtp() {
    try {
      await enviador.verifica();
      estat.posaVerify(true);
      return { ok: true };
    } catch (err) {
      const missatge = tradueixErrorSmtp(missatgeError(err));
      log.avis('No s’ha pogut verificar el SMTP', err);
      estat.posaVerify(false, missatge);
      return { ok: false, missatge };
    }
  }

  return { processa, unPas, bucle, tick, comprovaSmtp, atura: () => { aturant = true; }, estaOcupat: () => ocupat };
}

module.exports = { creaMotor };
