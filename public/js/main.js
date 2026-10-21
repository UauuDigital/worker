// Orquestració del panell: sessió, actualització automàtica cada 10 s, filtres i accions.
import { api, ErrorApi } from './api.js';
import { $ } from './dom.js';
import { pintaEstat, pintaEstatSenseDades, pintaTecnic } from './vista-estat.js';
import { pintaLlista, mostraAvisConnexio } from './vista-llista.js';
import { formataHora } from './format.js';

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
  carrega();
  clearInterval(temporitzador);
  temporitzador = setInterval(() => { if (!document.hidden) carrega(); }, INTERVAL_MS);
}

async function carrega() {
  if (carregant) return undefined;
  carregant = true;
  try {
    const [estat, historial] = await Promise.all([api.estat(), api.historial(filtre)]);
    pintaEstat(estat);
    pintaTecnic(estat);
    pintaLlista(historial);
    ultimaCarregaOk = new Date().toISOString();
    mostraAvisConnexio('');
  } catch (err) {
    if (err instanceof ErrorApi && err.estat === 401) return mostraLogin(err.message);
    // Si l'API no respon, ho diem clarament: les dades que es veuen poden estar desfasades.
    const quan = ultimaCarregaOk ? `Les dades són de les ${formataHora(ultimaCarregaOk)}.` : 'Encara no s’ha pogut carregar cap dada.';
    mostraAvisConnexio(`${err.message} ${quan}`);
    if (!ultimaCarregaOk) pintaEstatSenseDades();
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

// Filtres: pastilles d'estat i cerca per destinatari.
const canviaFiltre = () => { filtre.pagina = 1; carrega(); };
$('pastilles').addEventListener('click', (ev) => {
  const boto = ev.target.closest('.pastilla');
  if (!boto) return;
  for (const p of $('pastilles').children) p.setAttribute('aria-pressed', String(p === boto));
  filtre.estat = boto.dataset.estat;
  canviaFiltre();
});
let retard = null;
$('filtre-cerca').addEventListener('input', (ev) => {
  clearTimeout(retard);
  retard = setTimeout(() => { filtre.cerca = ev.target.value.trim(); canviaFiltre(); }, 350);
});
$('pag-anterior').addEventListener('click', () => { filtre.pagina = Math.max(1, filtre.pagina - 1); carrega(); });
$('pag-seguent').addEventListener('click', () => { filtre.pagina += 1; carrega(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('vista-panell').hidden) carrega(); });

// En pantalla ampla l'estat tècnic és una columna lateral: sempre oberta i sense botó de plegar.
const ample = window.matchMedia('(min-width: 1000px)');
const ajustaTecnic = () => { if (ample.matches) $('tecnic').open = true; };
ample.addEventListener('change', ajustaTecnic);
$('tecnic').querySelector('summary').addEventListener('click', (ev) => { if (ample.matches) ev.preventDefault(); });
ajustaTecnic();

(async function inicia() {
  try {
    await api.sessio();
    mostraPanell();
  } catch (err) {
    mostraLogin(err instanceof ErrorApi && err.estat === 0 ? err.message : '');
  }
})();
