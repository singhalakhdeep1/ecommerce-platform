import { randomBytes } from 'crypto';
import { Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
import { Cart, CartItem, Product } from '../../models';
import { round2 } from '../../models/fields';
import type { User } from '../../models/User';
import { AppError } from '../../utils/appError';

export interface CartOwner {
  user?: User | null;
  /** Guest cart token (X-Cart-Token header). */
  token?: string | null;
}

export type CartWithItems = Cart & { items: Array<CartItem & { product: Product }> };

const INCLUDE = [{ model: CartItem, as: 'items', include: [{ model: Product, as: 'product' }] }];

export function newCartToken(): string {
  return randomBytes(24).toString('hex');
}

function variantOf(product: Product, variantName: string) {
  if (!variantName) {
    if (product.variants.length > 0) throw AppError.badRequest(`Choose an option for ${product.name}: ${product.variants.map((v) => v.name).join(', ')}`);
    return null;
  }
  const variant = product.variants.find((v) => v.name === variantName);
  if (!variant) throw AppError.badRequest(`${product.name} has no option "${variantName}"`);
  return variant;
}

/** Price and stock for a product line, honouring variant overrides. */
export function lineTerms(product: Product, variantName: string): { price: number; stock: number } {
  const variant = variantOf(product, variantName);
  return {
    price: Number(variant?.price ?? product.price),
    stock: variant?.quantity !== undefined ? Math.min(variant.quantity, product.stock) : product.stock,
  };
}

export async function findCart(owner: CartOwner, transaction?: Transaction): Promise<CartWithItems | null> {
  if (owner.user) return (await Cart.findOne({ where: { userId: owner.user.id }, include: INCLUDE, transaction })) as CartWithItems | null;
  if (owner.token) return (await Cart.findOne({ where: { sessionToken: owner.token }, include: INCLUDE, transaction })) as CartWithItems | null;
  return null;
}

async function getOrCreate(owner: CartOwner, transaction?: Transaction): Promise<{ cart: Cart; token: string | null }> {
  if (owner.user) {
    const [cart] = await Cart.findOrCreate({ where: { userId: owner.user.id }, defaults: { userId: owner.user.id }, transaction });
    return { cart, token: null };
  }
  if (owner.token) {
    const existing = await Cart.findOne({ where: { sessionToken: owner.token }, transaction });
    if (existing) return { cart: existing, token: owner.token };
  }
  const token = newCartToken();
  return { cart: await Cart.create({ sessionToken: token }, { transaction }), token };
}

async function recalc(cartId: string, transaction?: Transaction): Promise<void> {
  const items = await CartItem.findAll({ where: { cartId }, transaction });
  const total = round2(items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0));
  await Cart.update({ totalAmount: total, lastActivityAt: new Date(), reminderSentAt: null }, { where: { id: cartId }, transaction });
}

export function serializeCart(cart: CartWithItems | null, token?: string | null) {
  const items = (cart?.items ?? [])
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((i) => ({
      id: i.id,
      productId: i.productId,
      variantName: i.variantName,
      quantity: i.quantity,
      price: Number(i.price),
      lineTotal: round2(Number(i.price) * i.quantity),
      product: i.product
        ? { id: i.product.id, name: i.product.name, slug: i.product.slug, images: i.product.images, stock: i.product.stock, price: Number(i.product.price), weight: i.product.weight }
        : null,
    }));
  return {
    id: cart?.id ?? null,
    cartToken: token ?? cart?.sessionToken ?? null,
    items,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    subtotal: round2(items.reduce((s, i) => s + i.lineTotal, 0)),
  };
}

export async function getCart(owner: CartOwner) {
  return serializeCart(await findCart(owner), owner.user ? null : owner.token);
}

export async function addItem(owner: CartOwner, productId: string, quantity: number, variantName = '') {
  return sequelize.transaction(async (transaction) => {
    const product = await Product.findByPk(productId, { transaction });
    if (!product || !product.published) throw AppError.notFound('Product not found');
    const terms = lineTerms(product, variantName);
    const { cart, token } = await getOrCreate(owner, transaction);
    const existing = await CartItem.findOne({ where: { cartId: cart.id, productId, variantName }, transaction, lock: transaction.LOCK.UPDATE });
    const nextQty = (existing?.quantity ?? 0) + quantity;
    if (nextQty > terms.stock) throw AppError.conflict(`Only ${terms.stock} of ${product.name} in stock`);
    if (existing) await existing.update({ quantity: nextQty, price: terms.price }, { transaction });
    else await CartItem.create({ cartId: cart.id, productId, variantName, quantity, price: terms.price }, { transaction });
    await recalc(cart.id, transaction);
    return serializeCart((await Cart.findByPk(cart.id, { include: INCLUDE, transaction })) as CartWithItems, token);
  });
}

async function ownedItem(owner: CartOwner, itemId: string, transaction: Transaction): Promise<{ item: CartItem; cart: Cart }> {
  const cart = owner.user
    ? await Cart.findOne({ where: { userId: owner.user.id }, transaction })
    : owner.token
      ? await Cart.findOne({ where: { sessionToken: owner.token }, transaction })
      : null;
  const item = cart ? await CartItem.findOne({ where: { id: itemId, cartId: cart.id }, transaction }) : null;
  if (!cart || !item) throw AppError.notFound('Cart item not found');
  return { item, cart };
}

export async function updateItem(owner: CartOwner, itemId: string, quantity: number) {
  return sequelize.transaction(async (transaction) => {
    const { item, cart } = await ownedItem(owner, itemId, transaction);
    const product = await Product.findByPk(item.productId, { transaction });
    if (!product) throw AppError.notFound('Product no longer exists');
    const terms = lineTerms(product, item.variantName);
    if (quantity > terms.stock) throw AppError.conflict(`Only ${terms.stock} of ${product.name} in stock`);
    await item.update({ quantity, price: terms.price }, { transaction });
    await recalc(cart.id, transaction);
    return serializeCart((await Cart.findByPk(cart.id, { include: INCLUDE, transaction })) as CartWithItems, owner.user ? null : owner.token);
  });
}

export async function removeItem(owner: CartOwner, itemId: string) {
  return sequelize.transaction(async (transaction) => {
    const { item, cart } = await ownedItem(owner, itemId, transaction);
    await item.destroy({ transaction });
    await recalc(cart.id, transaction);
    return serializeCart((await Cart.findByPk(cart.id, { include: INCLUDE, transaction })) as CartWithItems, owner.user ? null : owner.token);
  });
}

export async function clearCart(owner: CartOwner, transaction?: Transaction): Promise<void> {
  const cart = owner.user
    ? await Cart.findOne({ where: { userId: owner.user.id }, transaction })
    : owner.token
      ? await Cart.findOne({ where: { sessionToken: owner.token }, transaction })
      : null;
  if (!cart) return;
  await CartItem.destroy({ where: { cartId: cart.id }, transaction });
  await cart.update({ totalAmount: 0, lastActivityAt: new Date() }, { transaction });
}

/** Moves a guest cart into the user's cart after login/registration (quantities are added, capped by stock). */
export async function mergeGuestCart(user: User, token: string | null | undefined): Promise<number> {
  if (!token) return 0;
  return sequelize.transaction(async (transaction) => {
    const guest = (await Cart.findOne({ where: { sessionToken: token }, include: INCLUDE, transaction })) as CartWithItems | null;
    if (!guest || guest.userId) return 0;
    const [target] = await Cart.findOrCreate({ where: { userId: user.id }, defaults: { userId: user.id }, transaction });
    let merged = 0;
    for (const item of guest.items) {
      if (!item.product) continue;
      const stock = lineTerms(item.product, item.variantName).stock;
      const existing = await CartItem.findOne({ where: { cartId: target.id, productId: item.productId, variantName: item.variantName }, transaction });
      const qty = Math.min(stock, (existing?.quantity ?? 0) + item.quantity);
      if (qty < 1) continue;
      if (existing) await existing.update({ quantity: qty }, { transaction });
      else await CartItem.create({ cartId: target.id, productId: item.productId, variantName: item.variantName, quantity: qty, price: item.price }, { transaction });
      merged++;
    }
    await guest.destroy({ transaction });
    await recalc(target.id, transaction);
    return merged;
  });
}
