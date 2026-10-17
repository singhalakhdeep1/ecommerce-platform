import { Op, Transaction } from 'sequelize';
import { Discount, DiscountRedemption } from '../../models';
import { round2 } from '../../models/fields';
import { AppError } from '../../utils/appError';

export interface PricedLine {
  productId: string;
  categoryId: string | null;
  /** Parent of the product's category, so a discount on "Electronics" covers "Phones". */
  parentCategoryId: string | null;
  lineTotal: number;
}

export interface DiscountEvaluation {
  discount: Discount;
  /** Money off the merchandise subtotal. */
  amount: number;
  freeShipping: boolean;
  /** Subtotal of the lines the code applies to. */
  eligibleSubtotal: number;
}

/**
 * Validates a discount code for a basket and computes what it is worth. Rules: active, inside its
 * date window, under the global usage limit and the per-user limit (counted from redemptions of
 * non-cancelled orders), minimum purchase, and product/category restrictions (only matching lines
 * are discounted). Percentage discounts respect maxDiscount; fixed discounts never exceed the eligible subtotal.
 */
export async function evaluateDiscount(code: string, userId: string | null, lines: PricedLine[], transaction?: Transaction): Promise<DiscountEvaluation> {
  const discount = await Discount.findOne({
    where: { code: code.trim().toUpperCase() },
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!discount || !discount.isActive) throw AppError.badRequest('Invalid discount code');

  const now = new Date();
  if (now < discount.startDate) throw AppError.badRequest('This discount code is not active yet');
  if (now > discount.endDate) throw AppError.badRequest('This discount code has expired');
  if (discount.usageLimit !== null && discount.usageCount >= discount.usageLimit) throw AppError.badRequest('This discount code has reached its usage limit');

  if (userId) {
    const used = await DiscountRedemption.count({ where: { discountId: discount.id, userId }, transaction });
    if (used >= discount.userLimit) throw AppError.badRequest('You have already used this discount code the maximum number of times');
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  if (subtotal < Number(discount.minimumPurchase)) {
    throw AppError.badRequest(`A minimum purchase of $${Number(discount.minimumPurchase).toFixed(2)} is required for this code`);
  }

  const restricted = discount.applicableProducts.length > 0 || discount.applicableCategories.length > 0;
  const eligible = restricted
    ? lines.filter(
        (l) =>
          discount.applicableProducts.includes(l.productId) ||
          (l.categoryId && discount.applicableCategories.includes(l.categoryId)) ||
          (l.parentCategoryId && discount.applicableCategories.includes(l.parentCategoryId)),
      )
    : lines;
  if (eligible.length === 0) throw AppError.badRequest('This discount code does not apply to the items in your cart');
  const eligibleSubtotal = round2(eligible.reduce((s, l) => s + l.lineTotal, 0));

  let amount = 0;
  if (discount.type === 'percentage') {
    amount = eligibleSubtotal * (Number(discount.value) / 100);
    if (discount.maxDiscount !== null) amount = Math.min(amount, Number(discount.maxDiscount));
  } else if (discount.type === 'fixed') {
    amount = Math.min(Number(discount.value), eligibleSubtotal);
  }
  return { discount, amount: round2(amount), freeShipping: discount.type === 'free_shipping', eligibleSubtotal };
}

/** Records use of a code by an order (inside the checkout transaction). */
export async function redeem(evaluation: DiscountEvaluation, userId: string, orderId: string, transaction: Transaction): Promise<void> {
  await DiscountRedemption.create({ discountId: evaluation.discount.id, userId, orderId, amount: evaluation.amount }, { transaction });
  await evaluation.discount.increment('usageCount', { by: 1, transaction });
}

/** Gives the use back when an unpaid order is cancelled or a paid one is fully refunded. */
export async function releaseRedemption(orderId: string, transaction?: Transaction): Promise<void> {
  const redemptions = await DiscountRedemption.findAll({ where: { orderId }, transaction });
  for (const r of redemptions) {
    await Discount.decrement('usageCount', { by: 1, where: { id: r.discountId, usageCount: { [Op.gt]: 0 } }, transaction });
    await r.destroy({ transaction });
  }
}
