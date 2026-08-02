// GraphQL controller for ecommerce-platform

const { GraphQLSchema, GraphQLObjectType, GraphQLString, GraphQLInt, GraphQLFloat, GraphQLList, GraphQLNonNull } = require('graphql');

const ProductType = new GraphQLObjectType({
  name: 'Product',
  fields: {
    id: { type: GraphQLNonNull(GraphQLString) },
    name: { type: GraphQLNonNull(GraphQLString) },
    description: { type: GraphQLString },
    price: { type: GraphQLNonNull(GraphQLFloat) },
    stock: { type: GraphQLInt },
    category: { type: GraphQLString },
    imageUrl: { type: GraphQLString },
    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
  },
});

const OrderType = new GraphQLObjectType({
  name: 'Order',
  fields: {
    id: { type: GraphQLNonNull(GraphQLString) },
    userId: { type: GraphQLNonNull(GraphQLString) },
    items: { type: new GraphQLList(new GraphQLObjectType({
      name: 'OrderItem',
      fields: {
        productId: { type: GraphQLString },
        quantity: { type: GraphQLInt },
        price: { type: GraphQLFloat },
      },
    })) },
    total: { type: GraphQLFloat },
    status: { type: GraphQLString },
    createdAt: { type: GraphQLString },
  },
});

const UserType = new GraphQLObjectType({
  name: 'User',
  fields: {
    id: { type: GraphQLNonNull(GraphQLString) },
    email: { type: GraphQLNonNull(GraphQLString) },
    name: { type: GraphQLString },
    address: { type: GraphQLString },
    createdAt: { type: GraphQLString },
  },
});

const RootQueryType = new GraphQLObjectType({
  name: 'Query',
  fields: {
    products: {
      type: new GraphQLList(ProductType),
      resolve: () => {
        return [];
      },
    },
    product: {
      type: ProductType,
      args: { id: { type: GraphQLString } },
      resolve: (_, { id }) => {
        return { id, name: 'Sample Product', price: 29.99 };
      },
    },
    orders: {
      type: new GraphQLList(OrderType),
      args: { userId: { type: GraphQLString } },
      resolve: (_, { userId }) => {
        return [];
      },
    },
    user: {
      type: UserType,
      args: { id: { type: GraphQLString } },
      resolve: (_, { id }) => {
        return { id, email: 'user@example.com', name: 'John Doe' };
      },
    },
  },
});

const RootMutationType = new GraphQLObjectType({
  name: 'Mutation',
  fields: {
    createProduct: {
      type: ProductType,
      args: {
        name: { type: GraphQLNonNull(GraphQLString) },
        description: { type: GraphQLString },
        price: { type: GraphQLNonNull(GraphQLFloat) },
        stock: { type: GraphQLInt },
        category: { type: GraphQLString },
      },
      resolve: (_, args) => {
        return { id: 'new-product-id', ...args };
      },
    },
    createOrder: {
      type: OrderType,
      args: {
        userId: { type: GraphQLNonNull(GraphQLString) },
        items: { type: new GraphQLList(new GraphQLObjectType({
          name: 'OrderItemInput',
          fields: {
            productId: { type: GraphQLString },
            quantity: { type: GraphQLInt },
          },
        })) },
      },
      resolve: (_, args) => {
        return { id: 'new-order-id', ...args, status: 'pending', total: 0 };
      },
    },
    updateUser: {
      type: UserType,
      args: {
        id: { type: GraphQLNonNull(GraphQLString) },
        name: { type: GraphQLString },
        address: { type: GraphQLString },
      },
      resolve: (_, args) => {
        return { ...args, email: 'user@example.com' };
      },
    },
  },
});

const schema = new GraphQLSchema({
  query: RootQueryType,
  mutation: RootMutationType,
});

module.exports = { schema, ProductType, OrderType, UserType };
