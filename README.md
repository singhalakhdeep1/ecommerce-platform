# E-Commerce Platform API

![Node.js](https://img.shields.io/badge/Node.js-18.x-green)
![Express](https://img.shields.io/badge/Express-4.18-white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)
![Sequelize](https://img.shields.io/badge/Sequelize-6.35-blue)
![Stripe](https://img.shields.io/badge/Stripe-14.5-purple)
![License](https://img.shields.io/badge/License-MIT-blue)

A production-ready e-commerce backend API with PostgreSQL, Sequelize ORM, Stripe payments, inventory management, and comprehensive analytics.

## 📋 Overview

The E-Commerce Platform API is a comprehensive backend solution designed to handle online store operations including product management, shopping cart, order processing, payment integration, and customer analytics. Built with Node.js, Express, PostgreSQL, and Sequelize, this API implements industry-standard e-commerce patterns with enterprise-grade features.

## ✨ Features

### Core E-Commerce
- **Product Management**: Full CRUD for products with variants and categories
- **Shopping Cart**: Persistent cart with guest and authenticated user support
- **Order Processing**: Complete order lifecycle from creation to fulfillment
- **Payment Integration**: Stripe and PayPal payment processing
- **Inventory Management**: Real-time stock tracking and low-stock alerts
- **Category Management**: Hierarchical category structure with filtering

### Advanced Features
- **Product Reviews & Ratings**: Customer reviews with moderation
- **Wishlist Management**: Save products for later purchase
- **Discount & Coupons**: Promotional code system with validation
- **Shipping Integration**: Multiple shipping providers and rate calculation
- **Tax Calculation**: Automated tax calculation based on location
- **Subscription Management**: Recurring billing for subscription products

### Analytics & Marketing
- **Sales Analytics**: Revenue, orders, and customer metrics
- **Customer Segmentation**: Group customers by behavior and purchase history
- **Marketing Campaigns**: Email campaigns and promotional offers
- **A/B Testing**: Test different product displays and pricing
- **Conversion Tracking**: Track customer journey and conversion rates
- **Inventory Reports**: Stock levels, reorder points, and forecasting

### Security & Performance
- **Payment Security**: PCI DSS compliant payment processing
- **Fraud Detection**: Automated fraud detection and prevention
- **Rate Limiting**: API rate limiting to prevent abuse
- **Caching**: Redis caching for frequently accessed data
- **Database Indexing**: Optimized queries for performance
- **Webhook Support**: Real-time notifications for payment events

## 🛠️ Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 18.x | Runtime environment |
| Express.js | 4.18.x | Web framework |
| PostgreSQL | 15.x | Relational database |
| Sequelize | 6.35.x | ORM |
| Stripe | 14.5.x | Payment processing |
| PayPal SDK | 1.0.x | Alternative payment |
| Redis | 7.x | Caching layer |
| JWT | 9.0.x | Authentication |
| Bcryptjs | 2.4.x | Password hashing |
| Winston | 3.10.x | Logging |

## 📁 Project Structure

```
ecommerce-platform/
├── config/
│   ├── database.js           # PostgreSQL configuration
│   └── redis.js              # Redis configuration
├── controllers/
│   ├── authController.js     # Authentication logic
│   ├── productController.js  # Product management
│   ├── cartController.js     # Shopping cart logic
│   ├── orderController.js    # Order processing
│   ├── paymentController.js  # Payment handling
│   ├── reviewController.js   # Review management
│   └── analyticsController.js # Analytics logic
├── middleware/
│   ├── auth.js               # JWT verification
│   └── errorHandler.js       # Error handling
├── models/
│   ├── User.js               # User schema
│   ├── Product.js            # Product schema
│   ├── Category.js           # Category schema
│   ├── Cart.js               # Cart schema
│   ├── Order.js              # Order schema
│   ├── OrderItem.js          # Order item schema
│   ├── Review.js             # Review schema
│   ├── Discount.js            # Discount/coupon schema
│   ├── Subscription.js       # Subscription schema
│   ├── Campaign.js           # Marketing campaign schema
│   ├── CustomerSegment.js    # Customer segmentation schema
│   ├── AnalyticsEvent.js     # Analytics event schema
│   └── index.js              # Model associations
├── routes/
│   ├── authRoutes.js         # Authentication endpoints
│   ├── productRoutes.js      # Product endpoints
│   ├── categoryRoutes.js     # Category endpoints
│   ├── cartRoutes.js         # Cart endpoints
│   ├── orderRoutes.js        # Order endpoints
│   ├── paymentRoutes.js      # Payment endpoints
│   ├── reviewRoutes.js       # Review endpoints
│   ├── analyticsRoutes.js    # Analytics endpoints
│   ├── subscriptionRoutes.js # Subscription endpoints
│   ├── marketingRoutes.js    # Marketing endpoints
│   └── integrationRoutes.js  # Third-party integrations
├── utils/
│   ├── logger.js             # Winston logger
│   ├── validator.js         # Input validation
│   ├── stripe.js             # Stripe utilities
│   └── email.js              # Email service
├── frontend-test/            # React test frontend
├── .env.example              # Environment template
├── .gitignore
├── package.json
└── server.js                 # Entry point
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18.x or higher
- PostgreSQL 15.x (local or cloud)
- Redis 7.x (for caching)
- Stripe account (for payments)
- npm or yarn package manager

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Alakhdeepsingh/ecommerce-platform.git
cd ecommerce-platform
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgres://localhost:5432/ecommerce
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRE=7d
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret
PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_CLIENT_SECRET=your-paypal-client-secret
CLIENT_URL=http://localhost:3000
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_EMAIL=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

4. Run database migrations:
```bash
npm run migrate
```

5. Seed database (optional):
```bash
npm run seed
```

6. Start the development server:
```bash
npm run dev
```

The API will be available at `http://localhost:5000`

---

## 📡 API Endpoints

### Authentication

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/register` | Register new user | No |
| POST | `/api/auth/login` | Login user | No |
| GET | `/api/auth/me` | Get current user | Yes |
| POST | `/api/auth/logout` | Logout user | Yes |

### Products

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/products` | Get all products (paginated) | No |
| GET | `/api/products/:id` | Get single product | No |
| POST | `/api/products` | Create product | Yes (Admin) |
| PUT | `/api/products/:id` | Update product | Yes (Admin) |
| DELETE | `/api/products/:id` | Delete product | Yes (Admin) |
| GET | `/api/products/:id/reviews` | Get product reviews | No |

### Categories

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/categories` | Get all categories | No |
| GET | `/api/categories/:id` | Get single category | No |
| POST | `/api/categories` | Create category | Yes (Admin) |
| PUT | `/api/categories/:id` | Update category | Yes (Admin) |
| DELETE | `/api/categories/:id` | Delete category | Yes (Admin) |

### Shopping Cart

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/cart` | Get user cart | Yes |
| POST | `/api/cart` | Add item to cart | Yes |
| PUT | `/api/cart/:itemId` | Update cart item | Yes |
| DELETE | `/api/cart/:itemId` | Remove item from cart | Yes |
| DELETE | `/api/cart` | Clear cart | Yes |

### Orders

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/orders` | Get user orders | Yes |
| POST | `/api/orders` | Create order | Yes |
| GET | `/api/orders/:id` | Get order details | Yes |
| PUT | `/api/orders/:id/status` | Update order status | Yes (Admin) |
| POST | `/api/orders/:id/cancel` | Cancel order | Yes |

### Payments

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/payments/create-intent` | Create payment intent | Yes |
| POST | `/api/payments/confirm` | Confirm payment | Yes |
| POST | `/api/payments/refund` | Refund payment | Yes (Admin) |
| POST | `/api/payments/webhook` | Stripe webhook | No |

### Reviews

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/reviews` | Create review | Yes |
| PUT | `/api/reviews/:id` | Update review | Yes |
| DELETE | `/api/reviews/:id` | Delete review | Yes |

### Analytics

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/analytics/sales` | Get sales analytics | Yes (Admin) |
| GET | `/api/analytics/products` | Get product analytics | Yes (Admin) |
| GET | `/api/analytics/customers` | Get customer analytics | Yes (Admin) |
| GET | `/api/analytics/inventory` | Get inventory reports | Yes (Admin) |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api-docs` | Swagger documentation |

---

## 🔐 Security Features

### Payment Security
- **PCI DSS Compliance**: Secure payment processing
- **Webhook Verification**: Stripe webhook signature verification
- **Tokenization**: Payment token handling
- **Fraud Detection**: Basic fraud detection patterns

### API Security
- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: API rate limiting per user
- **Input Validation**: Comprehensive request validation
- **SQL Injection Prevention**: Parameterized queries via Sequelize
- **XSS Protection**: Helmet.js security headers

### Data Protection
- **Encryption**: Sensitive data encryption at rest
- **Secure Passwords**: Bcrypt hashing with salt rounds
- **Access Control**: Role-based access control (RBAC)
- **Audit Logging**: Payment and order event logging

---

## 📊 Database Schema

### Product Model
```javascript
{
  name: String (required),
  description: Text,
  price: Decimal (required),
  comparePrice: Decimal,
  sku: String (unique),
  barcode: String,
  quantity: Number (default: 0),
  lowStockThreshold: Number,
  category: ObjectId (ref: Category),
  images: [String],
  variants: [{
    name: String,
    options: [String],
    price: Decimal,
    quantity: Number
  }],
  attributes: Object,
  isActive: Boolean (default: true),
  isFeatured: Boolean (default: false),
  weight: Number,
  dimensions: { length: Number, width: Number, height: Number },
  tags: [String],
  seoTitle: String,
  seoDescription: String,
  createdAt: Date,
  updatedAt: Date
}
```

### Order Model
```javascript
{
  user: ObjectId (ref: User),
  orderNumber: String (unique),
  status: String (enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled']),
  items: [{
    product: ObjectId (ref: Product),
    quantity: Number,
    price: Decimal,
    name: String,
    image: String
  }],
  subtotal: Decimal,
  tax: Decimal,
  shipping: Decimal,
  discount: Decimal,
  total: Decimal,
  shippingAddress: {
    name: String,
    address: String,
    city: String,
    state: String,
    zip: String,
    country: String
  },
  billingAddress: Object,
  paymentMethod: String,
  paymentStatus: String,
  paymentId: String,
  trackingNumber: String,
  notes: String,
  createdAt: Date,
  updatedAt: Date
}
```

### Review Model
```javascript
{
  user: ObjectId (ref: User),
  product: ObjectId (ref: Product),
  rating: Number (1-5),
  title: String,
  comment: Text,
  images: [String],
  isVerified: Boolean (default: false),
  isApproved: Boolean (default: true),
  helpful: Number (default: 0),
  createdAt: Date,
  updatedAt: Date
}
```

---

## 🧪 Testing

The project includes comprehensive test suites:

- **Product Tests**: Product CRUD, search, filtering
- **Cart Tests**: Add, update, remove items
- **Order Tests**: Order creation, status updates
- **Payment Tests**: Stripe integration, webhooks
- **Analytics Tests**: Sales reports, customer analytics

Run tests with coverage:
```bash
npm test -- --coverage
```

---

## 📈 Monitoring & Logging

### Winston Logger Configuration
- **Console**: Colored output for development
- **File**: Combined logs in `logs/combined.log`
- **Error File**: Error-specific logs in `logs/error.log`
- **Payment File**: Payment-specific logs in `logs/payments.log`
- **Log Levels**: error, warn, info, http, debug

### Metrics Tracked
- Sales revenue and trends
- Order conversion rates
- Product performance
- Customer acquisition
- Inventory turnover
- Payment success rates

---

## 🚀 Deployment

### Environment Variables for Production

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgres://user:pass@host:5432/ecommerce
REDIS_URL=redis://your-redis-instance:6379
JWT_SECRET=your-production-secret-key
JWT_EXPIRE=7d
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret
PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_CLIENT_SECRET=your-paypal-client-secret
CLIENT_URL=https://yourdomain.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_EMAIL=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

### Deployment Platforms

- **Heroku**: Ready for Heroku deployment with PostgreSQL add-on
- **Railway**: Compatible with Railway platform
- **AWS**: Can be deployed to EC2 with RDS PostgreSQL
- **DigitalOcean**: Compatible with App Platform with managed databases

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

Proprietary - All rights reserved.

---

## 👨‍💻 Author

**Alakhdeep Singh**

- GitHub: [@Alakhdeepsingh](https://github.com/Alakhdeepsingh)
- LinkedIn: [Alakhdeep Singh](https://linkedin.com/in/alakhdeepsingh)

---

## 🙏 Acknowledgments

- Built following e-commerce best practices
- Payment integration following Stripe documentation
- Security patterns from OWASP guidelines
- Inspired by industry-standard e-commerce platforms like Shopify
