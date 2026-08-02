// Elasticsearch controller for ecommerce-platform

const { Client } = require('@elastic/elasticsearch');

class ElasticsearchController {
  constructor() {
    this.client = new Client({
      node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
      auth: process.env.ELASTICSEARCH_AUTH
        ? { username: process.env.ELASTICSEARCH_USERNAME, password: process.env.ELASTICSEARCH_PASSWORD }
        : undefined,
    });
  }

  async indexProduct(product) {
    try {
      await this.client.index({
        index: 'products',
        id: product.id,
        document: product,
      });
      return { success: true, message: 'Product indexed successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async searchProducts(query) {
    try {
      const response = await this.client.search({
        index: 'products',
        query: {
          multi_match: {
            query,
            fields: ['name', 'description', 'category'],
          },
        },
      });
      return { success: true, hits: response.hits.hits };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getProduct(id) {
    try {
      const response = await this.client.get({
        index: 'products',
        id,
      });
      return { success: true, product: response._source };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async updateProduct(id, product) {
    try {
      await this.client.update({
        index: 'products',
        id,
        doc: product,
      });
      return { success: true, message: 'Product updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteProduct(id) {
    try {
      await this.client.delete({
        index: 'products',
        id,
      });
      return { success: true, message: 'Product deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async bulkIndexProducts(products) {
    try {
      const body = products.flatMap((product) => [
        { index: { _index: 'products', _id: product.id } },
        product,
      ]);
      await this.client.bulk({ refresh: true, body });
      return { success: true, message: 'Products indexed successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async createProductsIndex() {
    try {
      await this.client.indices.create({
        index: 'products',
        mappings: {
          properties: {
            name: { type: 'text' },
            description: { type: 'text' },
            price: { type: 'float' },
            category: { type: 'keyword' },
            stock: { type: 'integer' },
          },
        },
      });
      return { success: true, message: 'Index created successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async testConnection() {
    try {
      await this.client.ping();
      return { success: true, message: 'Elasticsearch connection successful' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new ElasticsearchController();
