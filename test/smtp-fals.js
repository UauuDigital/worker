// Servidor SMTP mínim per a proves (sense TLS). Guarda els missatges rebuts.
// comportament: { auth: false -> 535, rcpt: (adreça) => '451 ...' | null, lent: ms }
const net = require('node:net');

function creaSmtpFals(comportament = {}) {
  const rebuts = [];
  const connexions = new Set();

  const servidor = net.createServer((sock) => {
    connexions.add(sock);
    sock.on('close', () => connexions.delete(sock));
    sock.on('error', () => {});
    let buffer = '';
    let enDades = false;
    let actual = { to: [], dades: '' };
    const diu = (t) => sock.write(`${t}\r\n`);
    diu('220 smtp-fals ESMTP');

    function linia(l) {
      if (enDades) return;
      const ordre = l.toUpperCase();
      if (ordre.startsWith('EHLO') || ordre.startsWith('HELO')) { sock.write('250-smtp-fals\r\n250 AUTH PLAIN LOGIN\r\n'); return; }
      if (ordre.startsWith('AUTH')) {
        if (comportament.auth === false) diu('535 5.7.3 Authentication unsuccessful');
        else diu('235 2.7.0 Autenticat');
        return;
      }
      if (ordre.startsWith('MAIL FROM')) { actual = { to: [], dades: '' }; diu('250 ok'); return; }
      if (ordre.startsWith('RCPT TO')) {
        const adr = (l.match(/<([^>]*)>/) || [])[1];
        const resposta = comportament.rcpt ? comportament.rcpt(adr) : null;
        if (resposta) { diu(resposta); return; }
        actual.to.push(adr); diu('250 ok'); return;
      }
      if (ordre === 'DATA') { enDades = true; diu('354 envia'); return; }
      if (ordre === 'RSET' || ordre === 'NOOP') { diu('250 ok'); return; }
      if (ordre === 'QUIT') { diu('221 adéu'); sock.end(); return; }
      diu('500 ordre desconeguda');
    }

    sock.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (enDades) {
        const fi = buffer.indexOf('\r\n.\r\n');
        if (fi === -1) return;
        actual.dades = buffer.slice(0, fi);
        buffer = buffer.slice(fi + 5);
        enDades = false;
        const respon = () => { rebuts.push({ ...actual }); diu('250 2.0.0 Queued'); };
        if (comportament.lent) setTimeout(respon, comportament.lent); else respon();
      }
      let i;
      while (!enDades && (i = buffer.indexOf('\r\n')) !== -1) {
        const l = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        linia(l);
      }
    });
  });

  return {
    rebuts,
    arrenca: () => new Promise((res) => servidor.listen(0, '127.0.0.1', () => res(servidor.address().port))),
    atura: () => new Promise((res) => { for (const s of connexions) s.destroy(); servidor.close(() => res()); }),
  };
}

module.exports = { creaSmtpFals };
