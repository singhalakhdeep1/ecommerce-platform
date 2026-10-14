import { env } from '../../config/env';
import {
  AbExperiment,
  Category,
  CustomerSegment,
  Discount,
  Product,
  Review,
  User,
  sequelize,
} from '../../models';
import { logger } from '../../utils/logger';

interface SeedProduct {
  name: string;
  sku: string;
  category: string;
  price: number;
  comparePrice?: number;
  stock: number;
  description: string;
  featured?: boolean;
  tags: string[];
  weight: number;
  variants?: Array<{ name: string; price?: number; quantity: number }>;
  specifications?: Record<string, string>;
}

const CATEGORY_TREE: Array<{ name: string; description: string; children?: Array<{ name: string; description: string }> }> = [
  {
    name: 'Electronics',
    description: 'Phones, laptops and accessories',
    children: [
      { name: 'Phones', description: 'Smartphones and feature phones' },
      { name: 'Laptops', description: 'Notebooks and ultrabooks' },
      { name: 'Audio', description: 'Headphones and speakers' },
    ],
  },
  {
    name: 'Home & Kitchen',
    description: 'Everything for the house',
    children: [
      { name: 'Cookware', description: 'Pots, pans and bakeware' },
      { name: 'Furniture', description: 'Chairs, desks and shelves' },
    ],
  },
  {
    name: 'Fashion',
    description: 'Clothing, shoes and accessories',
    children: [
      { name: 'Shoes', description: 'Sneakers, boots and sandals' },
      { name: 'Bags', description: 'Backpacks and totes' },
    ],
  },
  { name: 'Books', description: 'Paperbacks, hardcovers and e-books' },
];

const PRODUCTS: SeedProduct[] = [
  { name: 'Nova X Smartphone', sku: 'PH-NOVA-X', category: 'Phones', price: 699, comparePrice: 799, stock: 40, featured: true, tags: ['phone', '5g', 'oled'], weight: 0.2, description: '6.5 inch OLED display, 128 GB storage, dual camera and all-day battery.', variants: [{ name: '128 GB', quantity: 25 }, { name: '256 GB', price: 799, quantity: 15 }], specifications: { Display: '6.5" OLED', Battery: '4500 mAh' } },
  { name: 'Pixel Lite Phone', sku: 'PH-PIXEL-L', category: 'Phones', price: 349, stock: 60, tags: ['phone', 'budget'], weight: 0.18, description: 'Affordable smartphone with a clean interface and two-day battery life.' },
  { name: 'AeroBook 14 Laptop', sku: 'LP-AERO-14', category: 'Laptops', price: 1199, comparePrice: 1399, stock: 18, featured: true, tags: ['laptop', 'ultrabook'], weight: 1.3, description: '14 inch ultrabook with 16 GB RAM, 512 GB SSD and a 12 hour battery.', specifications: { RAM: '16 GB', Storage: '512 GB SSD' } },
  { name: 'WorkStation Pro 16', sku: 'LP-WS-16', category: 'Laptops', price: 1899, stock: 7, tags: ['laptop', 'workstation'], weight: 2.1, description: '16 inch workstation for developers and designers, discrete GPU.' },
  { name: 'Studio Wireless Headphones', sku: 'AU-STUDIO-W', category: 'Audio', price: 249, comparePrice: 299, stock: 55, featured: true, tags: ['headphones', 'wireless', 'noise-cancelling'], weight: 0.3, description: 'Over-ear noise cancelling headphones with 30 hour battery.' },
  { name: 'Pocket Bluetooth Speaker', sku: 'AU-POCKET-S', category: 'Audio', price: 59, stock: 120, tags: ['speaker', 'bluetooth', 'waterproof'], weight: 0.4, description: 'Waterproof portable speaker with deep bass.' },
  { name: 'Earbuds Mini', sku: 'AU-EAR-MINI', category: 'Audio', price: 79, stock: 9, tags: ['earbuds', 'wireless'], weight: 0.05, description: 'True wireless earbuds with a charging case.' },
  { name: 'Cast Iron Skillet 12"', sku: 'CK-SKILLET-12', category: 'Cookware', price: 44, stock: 80, tags: ['skillet', 'cast-iron'], weight: 2.5, description: 'Pre-seasoned cast iron skillet for stovetop and oven.' },
  { name: 'Nonstick Pan Set (3 pc)', sku: 'CK-PANSET-3', category: 'Cookware', price: 89, comparePrice: 119, stock: 35, featured: true, tags: ['pan', 'nonstick'], weight: 3.1, description: 'Three nonstick pans in 8, 10 and 12 inch sizes.' },
  { name: 'Chef Knife 8"', sku: 'CK-KNIFE-8', category: 'Cookware', price: 69, stock: 48, tags: ['knife', 'steel'], weight: 0.25, description: 'Forged stainless steel chef knife.' },
  { name: 'Ergonomic Office Chair', sku: 'FU-CHAIR-E', category: 'Furniture', price: 329, comparePrice: 399, stock: 22, featured: true, tags: ['chair', 'office', 'ergonomic'], weight: 14, description: 'Adjustable lumbar support, breathable mesh back.' },
  { name: 'Standing Desk 140cm', sku: 'FU-DESK-140', category: 'Furniture', price: 459, stock: 12, tags: ['desk', 'standing'], weight: 28, description: 'Electric height adjustable desk with memory presets.' },
  { name: 'Bookshelf Oak 5-tier', sku: 'FU-SHELF-5', category: 'Furniture', price: 149, stock: 0, tags: ['shelf', 'oak'], weight: 18, description: 'Solid oak bookshelf with five tiers.' },
  { name: 'Trail Runner Sneakers', sku: 'SH-TRAIL-R', category: 'Shoes', price: 119, stock: 70, tags: ['sneakers', 'running'], weight: 0.6, description: 'Lightweight trail running shoes with grippy outsole.', variants: [{ name: 'US 8', quantity: 20 }, { name: 'US 9', quantity: 25 }, { name: 'US 10', quantity: 25 }] },
  { name: 'Leather Chelsea Boots', sku: 'SH-CHELSEA', category: 'Shoes', price: 159, comparePrice: 199, stock: 30, tags: ['boots', 'leather'], weight: 0.9, description: 'Full grain leather boots with elastic side panels.' },
  { name: 'Canvas Backpack 25L', sku: 'BG-CANVAS-25', category: 'Bags', price: 65, stock: 90, tags: ['backpack', 'canvas'], weight: 0.7, description: 'Water resistant canvas backpack with laptop sleeve.' },
  { name: 'Weekender Duffel', sku: 'BG-DUFFEL', category: 'Bags', price: 99, stock: 25, tags: ['duffel', 'travel'], weight: 1.1, description: 'Carry-on sized duffel for short trips.' },
  { name: 'The Pragmatic Programmer', sku: 'BK-PRAGMATIC', category: 'Books', price: 39, stock: 150, tags: ['programming', 'software'], weight: 0.6, description: 'Classic guide to software craftsmanship.' },
  { name: 'Designing Data-Intensive Applications', sku: 'BK-DDIA', category: 'Books', price: 49, comparePrice: 59, stock: 130, featured: true, tags: ['databases', 'distributed-systems'], weight: 0.9, description: 'The big ideas behind reliable, scalable systems.' },
  { name: 'Clean Architecture', sku: 'BK-CLEANARCH', category: 'Books', price: 34, stock: 4, tags: ['architecture', 'software'], weight: 0.5, description: 'A craftsman’s guide to software structure and design.' },
];

/**
 * Idempotent seed: running it twice updates rows instead of duplicating them.
 * Creates an admin and two customers (credentials come from SEED_ADMIN_* and are printed once).
 */
export async function seedAll(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  await sequelize.transaction(async (transaction) => {
    /* Users */
    const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
    const users: Array<{ name: string; email: string; password: string; role: 'admin' | 'customer' | 'seller' }> = [
      { name: 'Store Admin', email: adminEmail, password: adminPassword, role: 'admin' },
      { name: 'Alice Customer', email: 'alice@example.com', password: 'Customer123!', role: 'customer' },
      { name: 'Bob Customer', email: 'bob@example.com', password: 'Customer123!', role: 'customer' },
    ];
    for (const data of users) {
      const existing = await User.findOne({ where: { email: data.email }, transaction });
      if (!existing) await User.create({ ...data, emailVerified: true }, { transaction });
    }
    counts.users = users.length;

    /* Category tree */
    const categoryIds = new Map<string, string>();
    let order = 0;
    for (const root of CATEGORY_TREE) {
      const [parent] = await Category.findOrCreate({
        where: { name: root.name },
        defaults: { name: root.name, description: root.description, sortOrder: order++ },
        transaction,
      });
      categoryIds.set(root.name, parent.id);
      for (const child of root.children ?? []) {
        const [sub] = await Category.findOrCreate({
          where: { name: child.name },
          defaults: { name: child.name, description: child.description, parentId: parent.id, sortOrder: order++ },
          transaction,
        });
        categoryIds.set(child.name, sub.id);
      }
      if (!root.children) continue;
    }
    counts.categories = categoryIds.size;

    /* Products */
    for (const p of PRODUCTS) {
      const [product, created] = await Product.findOrCreate({
        where: { sku: p.sku },
        defaults: {
          name: p.name,
          sku: p.sku,
          description: p.description,
          price: p.price,
          comparePrice: p.comparePrice ?? null,
          stock: p.stock,
          featured: p.featured ?? false,
          tags: p.tags,
          weight: p.weight,
          variants: p.variants ?? [],
          specifications: p.specifications ?? {},
          categoryId: categoryIds.get(p.category) ?? null,
          images: [],
        },
        transaction,
      });
      if (!created) {
        await product.update({ price: p.price, comparePrice: p.comparePrice ?? null, categoryId: categoryIds.get(p.category) ?? null }, { transaction });
      }
    }
    counts.products = PRODUCTS.length;

    /* Discount codes */
    const now = new Date();
    const inAYear = new Date(now.getTime() + 365 * 24 * 3600 * 1000);
    const discounts = [
      { code: 'WELCOME10', type: 'percentage' as const, value: 10, description: '10% off your order', minimumPurchase: 0, maxDiscount: 50, userLimit: 1 },
      { code: 'SAVE20', type: 'fixed' as const, value: 20, description: '$20 off orders over $100', minimumPurchase: 100, maxDiscount: null, userLimit: 3 },
      { code: 'FREESHIP', type: 'free_shipping' as const, value: 0, description: 'Free shipping', minimumPurchase: 0, maxDiscount: null, userLimit: 5 },
    ];
    for (const d of discounts) {
      await Discount.findOrCreate({
        where: { code: d.code },
        defaults: { ...d, startDate: new Date(now.getTime() - 24 * 3600 * 1000), endDate: inAYear },
        transaction,
      });
    }
    counts.discounts = discounts.length;

    /* Marketing segments */
    const segments = [
      { name: 'New customers', description: 'Registered in the last 30 days', criteria: { registeredWithinDays: 30 } },
      { name: 'Big spenders', description: 'Spent over $1000 in total', criteria: { minTotalSpent: 1000 } },
      { name: 'Win-back', description: 'No order in the last 60 days', criteria: { inactiveDays: 60 } },
    ];
    for (const s of segments) {
      await CustomerSegment.findOrCreate({ where: { name: s.name }, defaults: s, transaction });
    }
    counts.segments = segments.length;

    /* A/B experiments */
    const experiments = [
      { key: 'checkout_button_color', name: 'Checkout button colour', variants: ['A', 'B'] },
      { key: 'product_page_layout', name: 'Product page layout', variants: ['A', 'B'] },
      { key: 'price_display_format', name: 'Price display format', variants: ['A', 'B'] },
    ];
    for (const e of experiments) {
      await AbExperiment.findOrCreate({ where: { key: e.key }, defaults: { ...e, active: true }, transaction });
    }
    counts.experiments = experiments.length;

    /* A couple of reviews so rating UI has data */
    const alice = await User.findOne({ where: { email: 'alice@example.com' }, transaction });
    const bob = await User.findOne({ where: { email: 'bob@example.com' }, transaction });
    const sample = await Product.findAll({ where: { sku: ['PH-NOVA-X', 'AU-STUDIO-W', 'BK-DDIA'] }, transaction });
    for (const product of sample) {
      for (const [reviewer, rating, title, comment] of [
        [alice, 5, 'Excellent', 'Exactly what I hoped for.'],
        [bob, 4, 'Very good', 'Great value, minor nitpicks.'],
      ] as const) {
        if (!reviewer) continue;
        await Review.findOrCreate({
          where: { userId: reviewer.id, productId: product.id },
          defaults: { userId: reviewer.id, productId: product.id, rating, title, comment },
          transaction,
        });
      }
      const rows = await Review.findAll({ where: { productId: product.id }, transaction });
      const avg = rows.reduce((s, r) => s + r.rating, 0) / rows.length;
      await product.update({ rating: Math.round(avg * 100) / 100, numReviews: rows.length }, { transaction });
    }
  });

  logger.info('Seed complete', counts);
  if (env.isProduction) logger.warn('Seeded default users in production: change their passwords immediately');
  return counts;
}
