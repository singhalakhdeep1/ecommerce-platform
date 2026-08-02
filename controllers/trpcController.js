// tRPC controller for ecommerce-platform

const { initTRPC } = require('@trpc/server');

const t = initTRPC.create();

const appRouter = t.router({
  // Products
  getProducts: t.procedure.query(() => {
    return [];
  }),
  getProduct: t.procedure
    .input((val) => {
      if (typeof val === 'string') return val;
      throw new Error('Invalid input');
    })
    .query(({ input }) => {
      return { id: input, name: 'Sample Product', price: 29.99 };
    }),
  createProduct: t.procedure
    .input((val) => {
      if (typeof val === 'object' && val !== null) return val;
      throw new Error('Invalid input');
    })
    .mutation(({ input }) => {
      return { id: 'new-product-id', ...input };
    }),
  updateProduct: t.procedure
    .input((val) => {
      if (typeof val === 'object' && val !== null) return val;
      throw new Error('Invalid input');
    })
    .mutation(({ input }) => {
      return input;
    }),
  deleteProduct: t.procedure
    .input((val) => {
      if (typeof val === 'string') return val;
      throw new Error('Invalid input');
    })
    .mutation(({ input }) => {
      return { success: true, id: input };
    }),

  // Orders
  getOrders: t.procedure
    .input((val) => {
      if (typeof val === 'string') return val;
      throw new Error('Invalid input');
    })
    .query(({ input }) => {
      return [];
    }),
  getOrder: t.procedure
    .input((val) => {
      if (typeof val === 'string') return val;
      throw new Error('Invalid input');
    })
    .query(({ input }) => {
      return { id: input, userId: '1', status: 'pending' };
    }),
  createOrder: t.procedure
    .input((val) => {
      if (typeof val === 'object' && val !== null) return val;
      throw new Error('Invalid input');
    })
    .mutation(({ input }) => {
      return { id: 'new-order-id', ...input, status: 'pending' };
    }),
  updateOrderStatus: t.procedure
    .input((val) => {
      if (typeof val === 'object' && val !== null) return val;
      throw new Error('Invalid input');
    })
    .mutation(({ input }) => {
      return input;
    }),

  // Users
  getUser: t.procedure
    .input((val) => {
      if (typeof val === 'string') return val;
      throw new Error('Invalid input');
    })
    .query(({ input }) => {
      return { id: input, email: 'user@example.com', name: 'John Doe' };
    }),
  updateUser: t.procedure
    .input((val) => {
      if (typeof val === 'object' && val !== null) return val;
      throw new Error('Invalid input');
    })
    .mutation(({ input }) => {
      return input;
    }),

  // Cart
  getCart: t.procedure
    .input((val) => {
      if (typeof val === 'string') return val;
      throw new Error('Invalid input');
    })
    .query(({ input }) => {
      return { userId: input, items: [], total: 0 };
    }),
  addToCart: t.procedure
    .input((val) => {
      if (typeof val === 'object' && val !== null) return val;
      throw new Error('Invalid input');
    })
    .mutation(({ input }) => {
      return { success: true };
    }),
  removeFromCart: t.procedure
    .input((val) => {
      if (typeof val === 'object' && val !== null) return val;
      throw new Error('Invalid input');
    })
    .mutation(({ input }) => {
      return { success: true };
    }),
});

module.exports = { appRouter };
