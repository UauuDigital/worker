// Orquestració del panell: sessió, actualització automàtica cada 10 s, filtres i accions.
import { api, ErrorApi } from './api.js';
import {
  pintaSemafor, pintaSemaforSenseDades, pintaRitme, pintaXifres, pintaProces, pintaHistorial, mostraAvisConnexio,
} from './vista.js';
import { formataHora } from './format.js';

const $ = (id) => document.getElementById(id);
const INTERVAL_MS = 10_000;

const filtre = { pagina: 1, estat: '', cerca: '' };
let temporitzador = null;
let ultimaCarregaOk = null;
let carregant = false;

function mostraLogin(missatge = '') {
  clearInterval(temporitzador);
  $('vista-panell').hidden = true;
  $('vista-login').hidden = false;
  const e = $('error-login');
  e.hidden = !missatge;
  e.textContent = missatge;
  $('usuari').focus();
}

function mostraPanell() {
  $('vista-login').hidden = true;
  $('vista-panell').hidden = false;
  carrega(true);
  clearInterval(temporitzador);
  temporitzador = setInterval(() => { if (!document.hidden) carrega(); }, INTERVAL_MS);
}

// `anima`: només true en entrar o en canviar filtre/pàgina; el refresc automàtic repinta sense animar.
async function carrega(anima = false) {
  if (carregant) return;
  carregant = true;
  try {
    const [estat, historial] = await Promise.all([api.estat(), api.historial(filtre)]);
    pintaSemafor(estat);
    pintaRitme(estat.perHora);
    pintaXifres(estat.targetes);
    pintaProces(estat);
    pintaHistorial(historial, anima);
    ultimaCarregaOk = new Date().toISOString();
    mostraAvisConnexio('');
  } catch (err) {
    if (err instanceof ErrorApi && err.estat === 401) return mostraLogin(err.message);
    // Si l'API no respon, ho diem clarament: les dades que es veuen poden estar desfasades.
    const quan = ultimaCarregaOk ? `Les dades són de les ${formataHora(ultimaCarregaOk)}.` : 'Encara no s’ha pogut carregar cap dada.';
    mostraAvisConnexio(`${err.message} ${quan}`);
    if (!ultimaCarregaOk) pintaSemaforSenseDades();
  } finally {
    carregant = false;
  }
  return undefined;
}

$('form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const boto = ev.target.querySelector('button');
  boto.disabled = true;
  try {
    await api.login($('usuari').value, $('contrasenya').value);
    $('contrasenya').value = '';
    mostraPanell();
  } catch (err) {
    mostraLogin(err.message);
  } finally {
    boto.disabled = false;
  }
});

$('boto-sortir').addEventListener('click', async () => {
  try { await api.logout(); } catch { /* si falla, igualment tornem a l'accés */ }
  ultimaCarregaOk = null;
  mostraLogin();
});

$('boto-smtp').addEventListener('click', async () => {
  const boto = $('boto-smtp');
  const resultat = $('resultat-smtp');
  boto.disabled = true;
  resultat.textContent = 'Comprovant…';
  try {
    const r = await api.comprovaSmtp();
    resultat.textContent = r.ok
      ? `El servidor de correu respon correctament (${formataHora(r.at)}).`
      : `El servidor de correu no respon bé: ${r.missatge}`;
    carrega();
  } catch (err) {
    resultat.textContent = err.message;
  } finally {
    boto.disabled = false;
  }
});

let retard = null;
const aplicaFiltres = () => { filtre.pagina = 1; carrega(true); };
$('filtres').addEventListener('submit', (ev) => ev.preventDefault());
$('filtre-estat').addEventListener('change', (ev) => { filtre.estat = ev.target.value; aplicaFiltres(); });
$('filtre-cerca').addEventListener('input', (ev) => {
  clearTimeout(retard);
  retard = setTimeout(() => { filtre.cerca = ev.target.value.trim(); aplicaFiltres(); }, 350);
});
$('pag-anterior').addEventListener('click', () => { filtre.pagina = Math.max(1, filtre.pagina - 1); carrega(true); });
$('pag-seguent').addEventListener('click', () => { filtre.pagina += 1; carrega(true); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('vista-panell').hidden) carrega(); });

(async function inicia() {
  try {
    await api.sessio();
    mostraPanell();
  } catch (err) {
    mostraLogin(err instanceof ErrorApi && err.estat === 0 ? err.message : '');
  }
})();
