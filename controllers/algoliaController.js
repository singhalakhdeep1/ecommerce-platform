// Algolia controller for ecommerce-platform

const algoliasearch = require('algoliasearch');

class AlgoliaController {
  constructor() {
    this.client = algoliasearch(
      process.env.ALGOLIA_APP_ID || 'your-app-id',
      process.env.ALGOLIA_API_KEY || 'your-api-key'
    );
  }

  async indexProduct(product) {
    try {
      const index = this.client.initIndex('products');
      await index.saveObject(product);
      return { success: true, message: 'Product indexed successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async searchProducts(query, filters = {}) {
    try {
      const index = this.client.initIndex('products');
      const response = await index.search(query, filters);
      return { success: true, hits: response.hits, nbHits: response.nbHits };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getProduct(objectID) {
    try {
      const index = this.client.initIndex('products');
      const response = await index.getObject(objectID);
      return { success: true, product: response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async updateProduct(objectID, product) {
    try {
      const index = this.client.initIndex('products');
      await index.partialUpdateObject({ ...product, objectID });
      return { success: true, message: 'Product updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteProduct(objectID) {
    try {
      const index = this.client.initIndex('products');
      await index.deleteObject(objectID);
      return { success: true, message: 'Product deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async bulkIndexProducts(products) {
    try {
      const index = this.client.initIndex('products');
      await index.saveObjects(products);
      return { success: true, message: 'Products indexed successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async setProductsSettings(settings) {
    try {
      const index = this.client.initIndex('products');
      await index.setSettings(settings);
      return { success: true, message: 'Settings updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async clearProductsIndex() {
    try {
      const index = this.client.initIndex('products');
      await index.clearObjects();
      return { success: true, message: 'Index cleared successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async testConnection() {
    try {
      const response = await this.client.listIndices();
      return { success: true, message: 'Algolia connection successful', indices: response.items };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new AlgoliaController();
