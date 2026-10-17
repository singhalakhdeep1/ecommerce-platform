import { AppError } from '../../utils/appError';
import type { ServiceType } from '../commerce/shipping';

export type OrderType = 'standard' | 'express' | 'preorder';
export const ORDER_TYPES: OrderType[] = ['standard', 'express', 'preorder'];

export interface OrderLine {
  productId: string;
  name: string;
  quantity: number;
  stock: number;
  variantName: string;
  variantStock: number | null;
}

/**
 * Factory for order types. Each type decides which lines it accepts, whether stock is reserved
 * at checkout, and the default shipping service.
 */
export abstract class BaseOrder {
  abstract readonly type: OrderType;
  abstract readonly defaultService: ServiceType;
  /** Preorders are taken for items that are not in stock yet, so nothing is reserved. */
  abstract readonly reservesStock: boolean;

  validate(lines: OrderLine[]): void {
    if (lines.length === 0) throw AppError.badRequest('Cart is empty');
  }

  /** Order status right after payment succeeds. */
  statusAfterPayment(): 'processing' | 'pending' {
    return 'processing';
  }

  protected requireStock(lines: OrderLine[]): void {
    for (const line of lines) {
      const available = line.variantStock ?? line.stock;
      if (available < line.quantity) {
        throw AppError.conflict(`Insufficient stock for ${line.name}${line.variantName ? ` (${line.variantName})` : ''}: ${available} left`);
      }
    }
  }
}

export class StandardOrder extends BaseOrder {
  readonly type = 'standard' as const;
  readonly defaultService = 'ground' as const;
  readonly reservesStock = true;

  validate(lines: OrderLine[]): void {
    super.validate(lines);
    this.requireStock(lines);
  }
}

export class ExpressOrder extends BaseOrder {
  readonly type = 'express' as const;
  readonly defaultService = 'express' as const;
  readonly reservesStock = true;

  validate(lines: OrderLine[]): void {
    super.validate(lines);
    this.requireStock(lines);
    if (lines.reduce((n, l) => n + l.quantity, 0) > 20) throw AppError.badRequest('Express orders are limited to 20 items');
  }
}

export class PreorderOrder extends BaseOrder {
  readonly type = 'preorder' as const;
  readonly defaultService = 'ground' as const;
  readonly reservesStock = false;

  validate(lines: OrderLine[]): void {
    super.validate(lines);
    const inStock = lines.filter((l) => (l.variantStock ?? l.stock) > 0);
    if (inStock.length > 0) {
      throw AppError.badRequest(`Preorders are only for out-of-stock items; order these normally: ${inStock.map((l) => l.name).join(', ')}`);
    }
  }

  /** Paid preorders wait in "pending" until stock arrives and an admin moves them to processing. */
  statusAfterPayment(): 'pending' {
    return 'pending';
  }
}

export class OrderFactory {
  createOrder(type: OrderType = 'standard'): BaseOrder {
    switch (type) {
      case 'standard':
        return new StandardOrder();
      case 'express':
        return new ExpressOrder();
      case 'preorder':
        return new PreorderOrder();
      default:
        throw AppError.badRequest(`Unknown order type: ${String(type)}`);
    }
  }
}

export const orderFactory = new OrderFactory();
