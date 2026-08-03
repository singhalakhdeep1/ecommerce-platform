/**
 * Generic Repository Implementation
 * Implements Repository Pattern for data access abstraction
 */
class Repository {
  constructor(model) {
    this.model = model;
  }

  /**
   * Get entity by ID
   */
  async findById(id) {
    return await this.model.findById(id);
  }

  /**
   * Get entity by ID with includes
   */
  async findByIdWithIncludes(id, includes = []) {
    let query = this.model.findById(id);
    for (const include of includes) {
      query = query.populate(include);
    }
    return await query;
  }

  /**
   * Get all entities
   */
  async findAll() {
    return await this.model.find();
  }

  /**
   * Find entities matching conditions
   */
  async findWhere(conditions) {
    return await this.model.find(conditions);
  }

  /**
   * Find single entity matching conditions
   */
  async findSingle(conditions) {
    return await this.model.findOne(conditions);
  }

  /**
   * Check if any entity matches conditions
   */
  async exists(conditions) {
    return await this.model.exists(conditions);
  }

  /**
   * Count entities matching conditions
   */
  async count(conditions = {}) {
    return await this.model.countDocuments(conditions);
  }

  /**
   * Add new entity
   */
  async create(attributes) {
    return await this.model.create(attributes);
  }

  /**
   * Update existing entity
   */
  async update(entity, attributes) {
    Object.assign(entity, attributes);
    return await entity.save();
  }

  /**
   * Delete entity
   */
  async delete(entity) {
    return await entity.deleteOne();
  }

  /**
   * Delete by ID
   */
  async deleteById(id) {
    return await this.model.findByIdAndDelete(id);
  }

  /**
   * Paginated results
   */
  async paginate(page = 1, perPage = 20, conditions = {}) {
    const skip = (page - 1) * perPage;
    const total = await this.count(conditions);
    const items = await this.model.find(conditions)
      .skip(skip)
      .limit(perPage);

    return {
      items,
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
      hasPrevious: page > 1,
      hasNext: page < Math.ceil(total / perPage)
    };
  }

  /**
   * Cursor-based pagination
   */
  async cursorPaginate(cursor = null, perPage = 20, conditions = {}) {
    let query = this.model.find(conditions);

    if (cursor) {
      query = query.where('_id').gt(this.cursorFromString(cursor));
    }

    const items = await query.limit(perPage + 1).sort('_id');
    const hasMore = items.length > perPage;
    const resultItems = hasMore ? items.slice(0, perPage) : items;

    let nextCursor = null;
    if (hasMore && resultItems.length > 0) {
      nextCursor = this.cursorToString(resultItems[resultItems.length - 1]._id);
    }

    return {
      items: resultItems,
      nextCursor,
      hasMore
    };
  }

  cursorFromString(cursor) {
    return Buffer.from(cursor, 'base64').toString();
  }

  cursorToString(value) {
    return Buffer.from(value.toString()).toString('base64');
  }
}

module.exports = Repository;
