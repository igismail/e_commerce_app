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

  async sendOrderConfirmationEmail(input: {
    to: string;
    firstName: string;
    orderNumber: string;
    currency: string;
    totalAmount: number;
    items: Array<{ productName: string; variantName: string; quantity: number }>;
  }) {
    const itemLines = input.items
      .map(
        (item) =>
          `- ${item.productName} (${item.variantName}) × ${item.quantity}`,
      )
      .join('\n');
    const total = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: input.currency,
    }).format(input.totalAmount / 100);
    await this.transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: `Order ${input.orderNumber} confirmed`,
      text: `Hi ${input.firstName},\n\nThank you for your order ${input.orderNumber}.\n\n${itemLines}\n\nTotal: ${total}\n\nWe will send another update when your order ships.`,
    });
  }

  async sendAbandonedCartReminder(
    to: string,
    firstName: string,
    productNames: string[],
  ) {
    const items = [...new Set(productNames)].slice(0, 10).join(', ');
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'A few good things are still in your bag',
      text: `Hi ${firstName},\n\nYou left some items in your bag${items ? `: ${items}` : ''}.\n\nYour bag is waiting whenever you are ready to take another look.`,
    });
  }

  async sendLowStockAlert(input: {
    to: string;
    productName: string;
    sku: string;
    available: number;
  }) {
    await this.transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: `Low stock: ${input.sku}`,
      text: `${input.productName} (${input.sku}) has ${input.available} units available.`,
    });
  }
}
