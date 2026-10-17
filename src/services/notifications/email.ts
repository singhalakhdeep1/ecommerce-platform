import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { resilience } from '../errorHandling/errorHandlingService';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SentEmail extends EmailMessage {
  at: string;
  delivered: boolean;
}

let transporter: Transporter | null = null;
/** Last emails (kept in memory) so the admin UI and local verification can see what would be sent. */
const outbox: SentEmail[] = [];

function getTransporter(): Transporter | null {
  if (!env.email.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.email.host,
      port: env.email.port,
      secure: env.email.port === 465,
      auth: env.email.user ? { user: env.email.user, pass: env.email.pass } : undefined,
    });
  }
  return transporter;
}

/**
 * Sends through SMTP when EMAIL_HOST is set; otherwise the message is logged and kept in the
 * outbox (GET /api/system/outbox). Email never fails the business operation that triggered it.
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const smtp = getTransporter();
  let delivered = false;
  if (smtp) {
    try {
      await resilience('smtp', { retryCount: 1 }).executeWithResilience(() =>
        smtp.sendMail({ from: env.email.from, to: message.to, subject: message.subject, text: message.text, html: message.html }),
      );
      delivered = true;
    } catch (error) {
      logger.error('Email delivery failed', { to: message.to, subject: message.subject, error: error instanceof Error ? error.message : String(error) });
    }
  } else {
    logger.info('Email (SMTP not configured, not sent)', { to: message.to, subject: message.subject });
  }
  outbox.unshift({ ...message, at: new Date().toISOString(), delivered });
  outbox.length = Math.min(outbox.length, 200);
  return delivered;
}

export function recentEmails(limit = 50): SentEmail[] {
  return outbox.slice(0, limit);
}

const money = (n: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);

export const templates = {
  welcome: (name: string) => ({
    subject: 'Welcome to the store',
    text: `Hi ${name},\n\nYour account is ready. Happy shopping!`,
  }),
  orderConfirmation: (o: { orderNumber: string; totalAmount: number; currency: string; items: Array<{ name: string; quantity: number; total: number }> }) => ({
    subject: `Order ${o.orderNumber} confirmed`,
    text: `Thanks for your order ${o.orderNumber}.\n\n${o.items.map((i) => `${i.quantity} x ${i.name}  ${money(i.total, o.currency)}`).join('\n')}\n\nTotal paid: ${money(o.totalAmount, o.currency)}`,
  }),
  orderStatus: (orderNumber: string, status: string, trackingNumber?: string | null) => ({
    subject: `Order ${orderNumber} is ${status}`,
    text: `Your order ${orderNumber} is now ${status}.${trackingNumber ? `\nTracking number: ${trackingNumber}` : ''}`,
  }),
  refund: (orderNumber: string, amount: number, currency: string) => ({
    subject: `Refund for order ${orderNumber}`,
    text: `We refunded ${money(amount, currency)} for order ${orderNumber}. It can take 5-10 business days to appear on your statement.`,
  }),
  lowStock: (items: Array<{ name: string; sku: string; stock: number }>) => ({
    subject: `Low stock: ${items.length} product(s)`,
    text: items.map((i) => `${i.sku}  ${i.name}: ${i.stock} left`).join('\n'),
  }),
  abandonedCart: (name: string, items: Array<{ name: string; quantity: number }>, link: string) => ({
    subject: 'You left something in your cart',
    text: `Hi ${name},\n\nYour cart is waiting:\n${items.map((i) => `- ${i.quantity} x ${i.name}`).join('\n')}\n\nComplete your order: ${link}`,
  }),
};
