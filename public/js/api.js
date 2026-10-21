// Peticions a l'API. Qualsevol fallada es converteix en un ErrorApi amb missatge en català.
export class ErrorApi extends Error {
  constructor(missatge, estat) {
    super(missatge);
    this.estat = estat;
  }
}

async function peticio(url, opcions = {}) {
  let resposta;
  try {
    resposta = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      ...opcions,
    });
  } catch {
    throw new ErrorApi("No s'ha pogut contactar amb el servidor. Comprova la connexió.", 0);
  }
  let dades = null;
  try { dades = await resposta.json(); } catch { /* resposta sense JSON */ }
  if (!resposta.ok) {
    throw new ErrorApi((dades && dades.missatge) || 'El servidor ha respost amb un error inesperat.', resposta.status);
  }
  return dades;
}

const enviaJson = (cos) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(cos || {}),
});

export const api = {
  sessio: () => peticio('/api/sessio'),
  login: (usuari, contrasenya) => peticio('/api/login', enviaJson({ usuari, contrasenya })),
  logout: () => peticio('/api/logout', enviaJson()),
  estat: () => peticio('/api/estat'),
  historial: ({ pagina, estat, cerca }) => {
    const p = new URLSearchParams({ pagina: String(pagina) });
    if (estat) p.set('estat', estat);
    if (cerca) p.set('cerca', cerca);
    return peticio(`/api/historial?${p}`);
  },
  comprovaSmtp: () => peticio('/api/smtp/comprova', enviaJson()),
};
