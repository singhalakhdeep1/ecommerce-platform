/**
 * Strategy Pattern for Payment Providers
 * Allows dynamic selection of payment processing strategies
 */
class PaymentStrategy {
  constructor() {
    if (new.target === PaymentStrategy) {
      throw new Error('PaymentStrategy is an abstract class');
    }
  }

  providerName() {
    throw new Error('providerName must be implemented');
  }

  async processPayment(request) {
    throw new Error('processPayment must be implemented');
  }

  async processRefund(request) {
    throw new Error('processRefund must be implemented');
  }

  supportsCurrency(currency) {
    throw new Error('supportsCurrency must be implemented');
  }

  calculateFee(amount) {
    throw new Error('calculateFee must be implemented');
  }
}

/**
 * Stripe Payment Strategy
 */
class StripePaymentStrategy extends PaymentStrategy {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
  }

  providerName() {
    return 'Stripe';
  }

  async processPayment(request) {
    console.log(`Processing Stripe payment: ${request.referenceNumber}`);

    // Simulate Stripe API call
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      success: true,
      transactionId: `stripe_${this.generateId()}`,
      message: 'Payment processed successfully',
      fee: this.calculateFee(request.amount),
      processedAt: new Date(),
      metadata: {
        provider: this.providerName(),
        reference: request.referenceNumber
      }
    };
  }

  async processRefund(request) {
    console.log(`Processing Stripe refund: ${request.transactionId}`);

    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      success: true,
      refundId: `refund_${this.generateId()}`,
      message: 'Refund processed successfully',
      processedAt: new Date()
    };
  }

  supportsCurrency(currency) {
    const supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
    return supportedCurrencies.includes(currency.toUpperCase());
  }

  calculateFee(amount) {
    // Stripe fee: 2.9% + $0.30
    return (amount * 0.029) + 0.30;
  }

  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }
}

/**
 * PayPal Payment Strategy
 */
class PayPalPaymentStrategy extends PaymentStrategy {
  constructor(clientId, clientSecret) {
    super();
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  providerName() {
    return 'PayPal';
  }

  async processPayment(request) {
    console.log(`Processing PayPal payment: ${request.referenceNumber}`);

    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      success: true,
      transactionId: `paypal_${this.generateId()}`,
      message: 'Payment processed successfully',
      fee: this.calculateFee(request.amount),
      processedAt: new Date(),
      metadata: {
        provider: this.providerName(),
        reference: request.referenceNumber
      }
    };
  }

  async processRefund(request) {
    console.log(`Processing PayPal refund: ${request.transactionId}`);

    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      success: true,
      refundId: `refund_${this.generateId()}`,
      message: 'Refund processed successfully',
      processedAt: new Date()
    };
  }

  supportsCurrency(currency) {
    const supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];
    return supportedCurrencies.includes(currency.toUpperCase());
  }

  calculateFee(amount) {
    // PayPal fee: 2.9% + $0.30
    return (amount * 0.029) + 0.30;
  }

  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }
}

/**
 * Payment Strategy Factory
 */
class PaymentStrategyFactory {
  constructor(strategies = {}) {
    this.strategies = strategies;
  }

  getStrategy(providerName) {
    const strategy = this.strategies[providerName.toLowerCase()];
    if (!strategy) {
      throw new Error(`Unknown payment provider: ${providerName}`);
    }
    return strategy;
  }

  getStrategyForCurrency(currency) {
    for (const strategy of Object.values(this.strategies)) {
      if (strategy.supportsCurrency(currency)) {
        return strategy;
      }
    }
    throw new Error(`No payment provider supports currency: ${currency}`);
  }
}

module.exports = {
  PaymentStrategy,
  StripePaymentStrategy,
  PayPalPaymentStrategy,
  PaymentStrategyFactory
};
