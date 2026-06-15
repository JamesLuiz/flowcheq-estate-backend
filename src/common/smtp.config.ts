import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

/** Shared SMTP transport (Stalwart: port 465 + SSL/TLS). */
export function getSmtpTransportOptions(
  configService: ConfigService,
): SMTPTransport.Options | null {
  const smtpUser = configService.get<string>('SMTP_USER');
  const smtpPass = configService.get<string>('SMTP_PASS');
  if (!smtpUser || !smtpPass) {
    return null;
  }

  const smtpHost = configService.get<string>('SMTP_HOST') || 'mail.flowcheq.com';
  const smtpPort = parseInt(configService.get<string>('SMTP_PORT') || '465', 10);
  const smtpSecure = configService.get<string>('SMTP_SECURE') !== 'false';

  return {
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
    pool: true,
    maxConnections: 1,
    maxMessages: 3,
    tls: {
      rejectUnauthorized: configService.get<string>('SMTP_TLS_REJECT_UNAUTHORIZED') !== 'false',
    },
    requireTLS: !smtpSecure,
    debug: false,
  };
}

export function createSmtpTransporter(
  configService: ConfigService,
): nodemailer.Transporter | null {
  const options = getSmtpTransportOptions(configService);
  if (!options) return null;
  return nodemailer.createTransport(options);
}
