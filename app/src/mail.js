import fs from "node:fs";
import path from "node:path";

export function applyTemplate(db, id, fallbackSubject, fallbackBody, vars = {}) {
  let subject = fallbackSubject;
  let body = fallbackBody;
  try {
    const row = db.prepare("SELECT subject, body FROM email_templates WHERE id = ?").get(id);
    if (row) {
      subject = row.subject;
      body = row.body;
    }
  } catch {
    subject = fallbackSubject;
    body = fallbackBody;
  }
  const fill = (text) => String(text || "").replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] == null ? "" : String(vars[key])));
  return { subject: fill(subject), text: fill(body) };
}

export function createMailer(config) {
  const file = config.outboxPath;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let record = () => {};

  return {
    setRecorder(fn) { record = fn; },
    async send({ to, subject, text }) {
      const message = {
        to,
        subject,
        text,
        at: new Date().toISOString(),
        sent: false
      };
      if (config.smtp.host) {
        try {
          const nodemailer = await import("nodemailer");
          const transport = nodemailer.createTransport({
            host: config.smtp.host,
            port: config.smtp.port,
            secure: config.smtp.port === 465,
            auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined
          });
          await transport.sendMail({
            from: config.smtp.from,
            to,
            subject,
            text
          });
          message.sent = true;
        } catch (err) {
          message.error = "The email service rejected the message.";
          message.sent = false;
        }
      }
      fs.appendFileSync(file, JSON.stringify(message) + "\n");
      try { record(message); } catch { /* the mail log is best-effort beside the outbox file */ }
      return { stored: true, sent: message.sent };
    },
    readAll() {
      if (!fs.existsSync(file)) return [];
      return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    }
  };
}
