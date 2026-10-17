export interface User {
  id: string;
  name: string;
  email: string;
  role: 'customer' | 'admin' | 'seller';
  phone?: string | null;
  address?: Address | null;
  createdAt: string;
}

export interface Address {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  parentId?: string | null;
  productCount?: number;
  children?: Category[];
}

export interface Variant {
  name: string;
  price?: number;
  quantity?: number;
  sku?: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  comparePrice: number | null;
  stock: number;
  sku: string;
  images: string[];
  featured: boolean;
  published: boolean;
  rating: number;
  numReviews: number;
  tags: string[];
  variants: Variant[];
  specifications: Record<string, string | number>;
  lowStockThreshold: number;
  weight: number | null;
  categoryId: string | null;
  category?: { id: string; name: string; slug: string } | null;
  createdAt: string;
}

export interface Review {
  id: string;
  rating: number;
  title: string;
  comment: string;
  verified: boolean;
  helpful: number;
  userId: string;
  user?: { id: string; name: string } | null;
  createdAt: string;
}

export interface CartItem {
  id: string;
  productId: string;
  variantName: string;
  quantity: number;
  price: number;
  lineTotal: number;
  product: { id: string; name: string; slug: string; images: string[]; stock: number; price: number } | null;
}

export interface Cart {
  id: string | null;
  cartToken: string | null;
  items: CartItem[];
  itemCount: number;
  subtotal: number;
}

export interface Quote {
  subtotal: number;
  discount: { code: string; type: string; amount: number; freeShipping: boolean } | null;
  shipping: { provider: string; providerCode: string; serviceType: string; cost: number; isFreeShipping: boolean; estimatedDelivery: string };
  tax: { taxRate: number; taxAmount: number; taxType: string; jurisdiction: string };
  total: number;
}

export interface OrderItem {
  id: string;
  productId: string | null;
  variantName: string;
  quantity: number;
  price: number;
  total: number;
  productSnapshot: { name: string; sku: string; image?: string | null };
}

export interface Order {
  id: string;
  orderNumber: string;
  orderType: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  paymentMethod: string;
  paymentProvider: string | null;
  subtotal: number;
  tax: number;
  shippingCost: number;
  discount: number;
  discountCode: string | null;
  totalAmount: number;
  refundedAmount: number;
  currency: string;
  shippingAddress: Address;
  shippingProvider: string | null;
  shippingService: string | null;
  trackingNumber: string | null;
  fraudFlag: boolean;
  fraudScore: number;
  createdAt: string;
  items?: OrderItem[];
  user?: { id: string; name: string; email: string };
  events?: Array<{ id: string; fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }>;
  transactions?: Array<{ id: string; provider: string; type: string; status: string; amount: number; platformFee: number; createdAt: string }>;
}

export interface PaymentSession {
  provider: 'stripe' | 'sandbox' | 'paypal';
  providerRef: string;
  status: string;
  clientSecret?: string;
  approvalUrl?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}
