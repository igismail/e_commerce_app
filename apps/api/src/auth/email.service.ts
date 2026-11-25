import { Injectable } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly webBaseUrl: string;

  constructor() {
    const host = process.env.SMTP_HOST ?? 'mailpit';
    const port = Number(process.env.SMTP_PORT ?? 1025);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('SMTP_PORT must be a valid TCP port');
    }

    const username = process.env.SMTP_USER;
    const password = process.env.SMTP_PASSWORD;
    if (Boolean(username) !== Boolean(password)) {
      throw new Error('SMTP_USER and SMTP_PASSWORD must be set together');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === 'true',
      ...(username && password ? { auth: { user: username, pass: password } } : {}),
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
    this.from = process.env.SMTP_FROM ?? 'Commerce <no-reply@example.com>';
    this.webBaseUrl = process.env.WEB_BASE_URL ?? 'http://localhost:3000';
  }

  async sendVerificationEmail(to: string, firstName: string, token: string) {
    const url = new URL('/verify-email', this.webBaseUrl);
    url.searchParams.set('token', token);
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Verify your Commerce account',
      text: `Hi ${firstName},\n\nVerify your email address by opening this link:\n${url.toString()}\n\nThis link expires in 24 hours.`,
    });
  }

  async sendPasswordResetEmail(to: string, firstName: string, token: string) {
    const url = new URL('/reset-password', this.webBaseUrl);
    url.searchParams.set('token', token);
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Reset your Commerce password',
      text: `Hi ${firstName},\n\nReset your password by opening this link:\n${url.toString()}\n\nThis link expires in 1 hour. If you did not request this, you can ignore this email.`,
    });
  }
}
