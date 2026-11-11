import fs from "node:fs";
import path from "node:path";

export function createMailer(config) {
  const file = config.outboxPath;
  fs.mkdirSync(path.dirname(file), { recursive: true });

  return {
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
      return { stored: true, sent: message.sent };
    },
    readAll() {
      if (!fs.existsSync(file)) return [];
      return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    }
  };
}
