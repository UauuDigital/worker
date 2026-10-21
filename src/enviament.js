// Enviament SMTP amb nodemailer. Port 587 = STARTTLS (secure:false + requireTLS).
const crypto = require('node:crypto');
const nodemailer = require('nodemailer');

// `opcions` només l'usen les proves (servidor SMTP fals sense TLS).
function creaEnviador(config, opcions = {}) {
  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: false,
    requireTLS: opcions.requireTLS ?? true,
    ignoreTLS: opcions.ignoreTLS ?? false,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  // El Message-ID porta l'identificador del worker: queda al correu enviat i a `messageId` de la cua.
  const domini = config.remitent.email.split('@')[1] || 'localhost';
  const nouMessageId = () => `<${crypto.randomUUID()}.${config.workerId || 'worker'}@${domini}>`;

  return {
    verifica: () => transport.verify(),
    async envia(c) {
      const info = await transport.sendMail({
        messageId: nouMessageId(),
        from: { name: config.remitent.nom, address: config.remitent.email },
        to: c.destinatariNom ? { name: c.destinatariNom, address: c.destinatariEmail } : c.destinatariEmail,
        subject: c.assumpte,
        html: c.cosHtml,
        text: c.cosText,
      });
      return info.messageId || null;
    },
    tanca: () => transport.close(),
  };
}

const missatgeError = (err) => (err instanceof Error ? err.message : String(err));

module.exports = { creaEnviador, missatgeError };
