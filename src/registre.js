// Logs del servidor. Qualsevol secret conegut es substitueix abans d'escriure.
let secretsConeguts = [];

function configuraSecrets(llista) {
  secretsConeguts = llista.slice().sort((a, b) => b.length - a.length);
}

function neteja(text) {
  let t = String(text);
  for (const s of secretsConeguts) t = t.split(s).join('[ocult]');
  // URL de BD o similars que s'hagin colat amb usuari:clau@
  return t.replace(/(\w+:\/\/[^:\s/]+):[^@\s]+@/g, '$1:[ocult]@');
}

function missatgeDe(err) {
  if (!err) return '';
  const codi = err.code ? `[${err.code}] ` : '';
  return codi + (err.message || String(err));
}

function escriu(nivell, text, err) {
  const linia = `${new Date().toISOString()} [${nivell}] ${text}${err ? ` — ${missatgeDe(err)}` : ''}`;
  const net = neteja(linia);
  (nivell === 'ERROR' ? console.error : console.log)(net);
  return net;
}

module.exports = {
  configuraSecrets,
  neteja,
  info: (t) => escriu('INFO', t),
  avis: (t, e) => escriu('AVÍS', t, e),
  error: (t, e) => escriu('ERROR', t, e),
};
