/**
 * Factory Pattern for Order Creation
 * Creates different types of orders based on order type
 */
class OrderFactory {
  createOrder(orderType, context) {
    switch (orderType.toLowerCase()) {
      case 'standard':
        return new StandardOrder(context);
      case 'express':
        return new ExpressOrder(context);
      case 'preorder':
        return new PreorderOrder(context);
      default:
        throw new Error(`Unsupported order type: ${orderType}`);
    }
  }
}

/**
 * Base Order
 */
class BaseOrder {
  constructor(orderType, context) {
    this.orderId = this.generateOrderId(orderType);
    this.type = orderType;
    this.amount = context.amount || 0;
    this.customerId = context.customerId || null;
    this.createdAt = new Date();
    this.context = context;
  }

  generateOrderId(orderType) {
    return `${orderType.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  validate() {
    throw new Error('validate must be implemented');
  }

  async process() {
    throw new Error('process must be implemented');
  }

  async cancel() {
    throw new Error('cancel must be implemented');
  }

  getOrderId() {
    return this.orderId;
  }

  getType() {
    return this.type;
  }
}

/**
 * Standard Order
 */
class StandardOrder extends BaseOrder {
  constructor(context) {
    super('standard', context);
  }

  validate() {
    if (this.amount <= 0) {
      throw new Error('Invalid order amount');
    }
    if (!this.customerId) {
      throw new Error('Customer ID is required');
    }
    return true;
  }

  async process() {
    console.log(`Processing standard order: ${this.orderId}`);
    // Simulate order processing
    await new Promise(resolve => setTimeout(resolve, 50));
    return true;
  }

  async cancel() {
    console.log(`Cancelling standard order: ${this.orderId}`);
    // Simulate cancellation
    await new Promise(resolve => setTimeout(resolve, 50));
    return true;
  }
}

/**
 * Express Order
 */
class ExpressOrder extends BaseOrder {
  constructor(context) {
    super('express', context);
  }

  validate() {
    if (this.amount <= 0) {
      throw new Error('Invalid order amount');
    }
    if (!this.customerId) {
      throw new Error('Customer ID is required');
    }
    return true;
  }

  async process() {
    console.log(`Processing express order: ${this.orderId}`);
    // Simulate express order processing
    await new Promise(resolve => setTimeout(resolve, 30));
    return true;
  }

  async cancel() {
    console.log(`Cancelling express order: ${this.orderId}`);
    // Simulate cancellation
    await new Promise(resolve => setTimeout(resolve, 30));
    return true;
  }
}

/**
 * Preorder Order
 */
class PreorderOrder extends BaseOrder {
  constructor(context) {
    super('preorder', context);
  }

  validate() {
    if (this.amount <= 0) {
      throw new Error('Invalid order amount');
    }
    if (!this.customerId) {
      throw new Error('Customer ID is required');
    }
    if (!this.context.releaseDate) {
      throw new Error('Release date is required for preorder');
    }
    return true;
  }

  async process() {
    console.log(`Processing preorder: ${this.orderId}`);
    // Simulate preorder processing
    await new Promise(resolve => setTimeout(resolve, 100));
    return true;
  }

  async cancel() {
    console.log(`Cancelling preorder: ${this.orderId}`);
    // Simulate cancellation
    await new Promise(resolve => setTimeout(resolve, 50));
    return true;
  }
}

module.exports = {
  OrderFactory,
  BaseOrder,
  StandardOrder,
  ExpressOrder,
  PreorderOrder
};
