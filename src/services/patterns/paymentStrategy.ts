import axios from 'axios';
import { randomBytes } from 'crypto';
import Stripe from 'stripe';
import { env } from '../../config/env';
import { round2 } from '../../models/fields';
import { AppError } from '../../utils/appError';
import { resilience } from '../errorHandling/errorHandlingService';

export interface PaymentRequest {
  orderId: string;
  orderNumber: string;
  customerId: string;
  customerEmail: string;
  amount: number;
  currency: string;
  description: string;
  /** Forwarded to the provider so a retried request never creates a second charge. */
  idempotencyKey: string;
}

export interface PaymentSession {
  provider: string;
  providerRef: string;
  status: 'requires_action' | 'succeeded' | 'failed';
  /** Stripe Elements needs this to confirm the card in the browser. */
  clientSecret?: string;
  /** PayPal: where the buyer approves the payment. */
  approvalUrl?: string;
}

export interface RefundRequest {
  providerRef: string;
  amount: number;
  currency: string;
  reason?: string;
  idempotencyKey: string;
}

export interface RefundResult {
  provider: string;
  refundRef: string;
  status: 'succeeded' | 'pending' | 'failed';
}

/** Strategy interface: one implementation per payment provider. */
export interface PaymentStrategy {
  providerName(): string;
  createPayment(request: PaymentRequest): Promise<PaymentSession>;
  processRefund(request: RefundRequest): Promise<RefundResult>;
  supportsCurrency(currency: string): boolean;
  /** Provider processing fee for an amount (used for the platform-fee / payout split report). */
  calculateFee(amount: number): number;
}

/* ---------------- Stripe ---------------- */

export class StripePaymentStrategy implements PaymentStrategy {
  readonly client: Stripe;
  private readonly breaker = resilience('stripe');

  constructor(apiKey: string, options: Stripe.StripeConfig = {}) {
    this.client = new Stripe(apiKey, { maxNetworkRetries: 0, timeout: 15_000, ...options });
  }

  providerName() {
    return 'stripe';
  }

  async createPayment(request: PaymentRequest): Promise<PaymentSession> {
    const intent = await this.breaker.executeWithResilience(() =>
      this.client.paymentIntents.create(
        {
          amount: Math.round(request.amount * 100),
          currency: request.currency.toLowerCase(),
          description: request.description,
          receipt_email: request.customerEmail,
          metadata: { orderId: request.orderId, orderNumber: request.orderNumber, userId: request.customerId },
          automatic_payment_methods: { enabled: true },
        },
        { idempotencyKey: `pi_${request.idempotencyKey}` },
      ),
    );
    return {
      provider: 'stripe',
      providerRef: intent.id,
      status: intent.status === 'succeeded' ? 'succeeded' : 'requires_action',
      clientSecret: intent.client_secret ?? undefined,
    };
  }

  async retrieve(providerRef: string): Promise<Stripe.PaymentIntent> {
    return this.breaker.executeWithResilience(() => this.client.paymentIntents.retrieve(providerRef));
  }

  async processRefund(request: RefundRequest): Promise<RefundResult> {
    const refund = await this.breaker.executeWithResilience(() =>
      this.client.refunds.create(
        { payment_intent: request.providerRef, amount: Math.round(request.amount * 100), reason: 'requested_by_customer', metadata: { note: request.reason ?? '' } },
        { idempotencyKey: `re_${request.idempotencyKey}` },
      ),
    );
    return { provider: 'stripe', refundRef: refund.id, status: refund.status === 'succeeded' ? 'succeeded' : refund.status === 'failed' ? 'failed' : 'pending' };
  }

  supportsCurrency(currency: string) {
    return ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'INR', 'SGD'].includes(currency.toUpperCase());
  }

  calculateFee(amount: number) {
    return round2(amount * 0.029 + 0.3);
  }
}

/* ---------------- PayPal (Orders v2 REST API) ---------------- */

export class PayPalPaymentStrategy implements PaymentStrategy {
  private token: { value: string; expiresAt: number } | null = null;
  private readonly breaker = resilience('paypal');

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly baseUrl = env.payments.paypalBaseUrl,
  ) {}

  providerName() {
    return 'paypal';
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const { data } = await axios.post<{ access_token: string; expires_in: number }>(`${this.baseUrl}/v1/oauth2/token`, 'grant_type=client_credentials', {
      auth: { username: this.clientId, password: this.clientSecret },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15_000,
    });
    this.token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }

  private async call<T>(method: 'get' | 'post', path: string, body: unknown, requestId?: string): Promise<T> {
    return this.breaker.executeWithResilience(async () => {
      const token = await this.accessToken();
      const { data } = await axios.request<T>({
        method,
        url: `${this.baseUrl}${path}`,
        data: body,
        timeout: 15_000,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(requestId ? { 'PayPal-Request-Id': requestId } : {}) },
      });
      return data;
    });
  }

  async createPayment(request: PaymentRequest): Promise<PaymentSession> {
    const order = await this.call<{ id: string; status: string; links: Array<{ rel: string; href: string }> }>(
      'post',
      '/v2/checkout/orders',
      {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: request.orderId,
            custom_id: request.orderId,
            invoice_id: request.orderNumber,
            description: request.description,
            amount: { currency_code: request.currency.toUpperCase(), value: request.amount.toFixed(2) },
          },
        ],
        application_context: {
          brand_name: 'E-Commerce Store',
          user_action: 'PAY_NOW',
          return_url: `${env.clientUrl}/checkout/paypal-return`,
          cancel_url: `${env.clientUrl}/cart`,
        },
      },
      `create-${request.idempotencyKey}`,
    );
    const approve = order.links.find((l) => l.rel === 'approve' || l.rel === 'payer-action');
    return { provider: 'paypal', providerRef: order.id, status: 'requires_action', approvalUrl: approve?.href };
  }

  /** Captures an approved PayPal order. Returns the capture id (needed for refunds) and the amount. */
  async capture(paypalOrderId: string): Promise<{ status: string; captureId: string | null; amount: number; orderId: string | null }> {
    const result = await this.call<{
      status: string;
      purchase_units: Array<{ custom_id?: string; reference_id?: string; payments?: { captures?: Array<{ id: string; status: string; amount: { value: string } }> } }>;
    }>('post', `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {}, `capture-${paypalOrderId}`);
    const unit = result.purchase_units[0];
    const capture = unit?.payments?.captures?.[0];
    return { status: result.status, captureId: capture?.id ?? null, amount: Number(capture?.amount.value ?? 0), orderId: unit?.custom_id ?? unit?.reference_id ?? null };
  }

  async processRefund(request: RefundRequest): Promise<RefundResult> {
    const refund = await this.call<{ id: string; status: string }>(
      'post',
      `/v2/payments/captures/${encodeURIComponent(request.providerRef)}/refund`,
      { amount: { value: request.amount.toFixed(2), currency_code: request.currency.toUpperCase() }, note_to_payer: request.reason?.slice(0, 255) },
      `refund-${request.idempotencyKey}`,
    );
    return { provider: 'paypal', refundRef: refund.id, status: refund.status === 'COMPLETED' ? 'succeeded' : 'pending' };
  }

  supportsCurrency(currency: string) {
    return ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'].includes(currency.toUpperCase());
  }

  calculateFee(amount: number) {
    return round2(amount * 0.0349 + 0.49);
  }
}

/* ---------------- Sandbox (local development, no provider account) ---------------- */

/**
 * Local test provider used when no Stripe key is configured. It never sees card data: the client
 * confirms with a Stripe-style test payment method id. `pm_card_visa` / `pm_card_mastercard`
 * succeed, `pm_card_chargeDeclined` and `pm_card_insufficientFunds` fail.
 */
export class SandboxPaymentStrategy implements PaymentStrategy {
  static readonly TEST_METHODS: Record<string, { ok: boolean; message: string }> = {
    pm_card_visa: { ok: true, message: 'Visa test card approved' },
    pm_card_mastercard: { ok: true, message: 'Mastercard test card approved' },
    pm_card_chargeDeclined: { ok: false, message: 'Your card was declined' },
    pm_card_insufficientFunds: { ok: false, message: 'Your card has insufficient funds' },
  };

  providerName() {
    return 'sandbox';
  }

  async createPayment(_request: PaymentRequest): Promise<PaymentSession> {
    const ref = `sbx_pi_${randomBytes(12).toString('hex')}`;
    return { provider: 'sandbox', providerRef: ref, status: 'requires_action', clientSecret: `${ref}_secret_${randomBytes(8).toString('hex')}` };
  }

  confirm(paymentMethod: string): { ok: boolean; message: string } {
    const outcome = SandboxPaymentStrategy.TEST_METHODS[paymentMethod];
    if (!outcome) throw AppError.badRequest(`Unknown sandbox payment method. Use one of: ${Object.keys(SandboxPaymentStrategy.TEST_METHODS).join(', ')}`);
    return outcome;
  }

  async processRefund(_request: RefundRequest): Promise<RefundResult> {
    return { provider: 'sandbox', refundRef: `sbx_re_${randomBytes(12).toString('hex')}`, status: 'succeeded' };
  }

  supportsCurrency() {
    return true;
  }

  calculateFee(amount: number) {
    return round2(amount * 0.029 + 0.3);
  }
}

/* ---------------- Factory ---------------- */

export class PaymentStrategyFactory {
  private readonly strategies = new Map<string, PaymentStrategy>();

  constructor(strategies: Record<string, PaymentStrategy | null>) {
    for (const [name, strategy] of Object.entries(strategies)) if (strategy) this.strategies.set(name, strategy);
  }

  /** Card payments go to Stripe when configured, otherwise the sandbox. */
  static fromEnv(): PaymentStrategyFactory {
    const p = env.payments;
    const stripe = p.stripeSecretKey && p.provider !== 'sandbox' ? new StripePaymentStrategy(p.stripeSecretKey, stripeHostOptions()) : null;
    const paypal = p.paypalClientId && p.paypalClientSecret ? new PayPalPaymentStrategy(p.paypalClientId, p.paypalClientSecret) : null;
    const sandbox = p.provider === 'stripe' ? null : new SandboxPaymentStrategy();
    return new PaymentStrategyFactory({ stripe, paypal, sandbox });
  }

  has(provider: string): boolean {
    return this.strategies.has(provider);
  }

  getStrategy(provider: string): PaymentStrategy {
    const strategy = this.strategies.get(provider);
    if (!strategy) throw AppError.badRequest(`Payment provider "${provider}" is not configured`);
    return strategy;
  }

  /** The provider that handles card payments right now. */
  cardProvider(): 'stripe' | 'sandbox' {
    if (this.strategies.has('stripe')) return 'stripe';
    if (this.strategies.has('sandbox')) return 'sandbox';
    throw AppError.unavailable('No card payment provider is configured');
  }

  getStrategyForCurrency(currency: string): PaymentStrategy {
    for (const strategy of this.strategies.values()) if (strategy.supportsCurrency(currency)) return strategy;
    throw AppError.badRequest(`No payment provider supports ${currency}`);
  }

  available(): string[] {
    return [...this.strategies.keys()];
  }
}

/** STRIPE_API_BASE lets the Stripe client talk to stripe-mock in local verification. */
function stripeHostOptions(): Stripe.StripeConfig {
  const base = process.env.STRIPE_API_BASE;
  if (!base) return {};
  const url = new URL(base);
  return { host: url.hostname, port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)), protocol: url.protocol.replace(':', '') as 'http' | 'https' };
}

export const payments = PaymentStrategyFactory.fromEnv();
