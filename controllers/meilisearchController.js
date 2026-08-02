// Meilisearch controller for ecommerce-platform

const { MeiliSearch } = require('meilisearch');

class MeilisearchController {
  constructor() {
    this.client = new MeiliSearch({
      host: process.env.MEILISEARCH_URL || 'http://localhost:7700',
      apiKey: process.env.MEILISEARCH_API_KEY || 'masterKey',
    });
  }

  async indexProduct(product) {
    try {
      const index = this.client.index('products');
      await index.addDocuments([product]);
      return { success: true, message: 'Product indexed successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async searchProducts(query, options = {}) {
    try {
      const index = this.client.index('products');
      const response = await index.search(query, options);
      return { success: true, hits: response.hits, estimatedTotalHits: response.estimatedTotalHits };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getProduct(id) {
    try {
      const index = this.client.index('products');
      const response = await index.getDocument(id);
      return { success: true, product: response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async updateProduct(id, product) {
    try {
      const index = this.client.index('products');
      await index.updateDocuments([{ ...product, id }]);
      return { success: true, message: 'Product updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteProduct(id) {
    try {
      const index = this.client.index('products');
      await index.deleteDocument(id);
      return { success: true, message: 'Product deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async bulkIndexProducts(products) {
    try {
      const index = this.client.index('products');
      await index.addDocuments(products);
      return { success: true, message: 'Products indexed successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async createProductsIndex() {
    try {
      await this.client.createIndex('products', { primaryKey: 'id' });
      return { success: true, message: 'Index created successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async updateProductsSettings(settings) {
    try {
      const index = this.client.index('products');
      await index.updateSettings(settings);
      return { success: true, message: 'Settings updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteProductsIndex() {
    try {
      await this.client.deleteIndex('products');
      return { success: true, message: 'Index deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async testConnection() {
    try {
      const response = await this.client.getIndexes();
      return { success: true, message: 'Meilisearch connection successful', indexes: response.results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new MeilisearchController();
