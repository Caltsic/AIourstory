import * as nodemailer from "nodemailer";

import { config } from "../config.js";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!config.smtpUser || !config.smtpPass) {
    throw new Error("SMTP credentials are not configured");
  }

  transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
  });

  return transporter;
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  text: string;
}) {
  const from = config.mailFrom || config.smtpUser;
  if (!from) {
    throw new Error("MAIL_FROM or SMTP_USER must be configured");
  }

  await getTransporter().sendMail({
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
  });
}
