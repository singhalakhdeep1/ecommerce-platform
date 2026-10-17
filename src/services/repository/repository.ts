import { Attributes, CreationAttributes, FindOptions, Includeable, Model, ModelStatic, Op, Order, Transaction, WhereOptions } from 'sequelize';

export interface Page<T> {
  items: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Generic data access over a Sequelize model. Bound to a transaction when created by a
 * UnitOfWork, so every call made through it joins that transaction.
 */
export class Repository<M extends Model> {
  constructor(
    readonly model: ModelStatic<M>,
    private readonly transaction?: Transaction,
  ) {}

  private opts<O extends object>(options: O): O & { transaction?: Transaction } {
    return this.transaction ? { ...options, transaction: this.transaction } : options;
  }

  findById(id: string | number, include?: Includeable[], lock = false): Promise<M | null> {
    return this.model.findByPk(id, this.opts({ include, ...(lock && this.transaction ? { lock: this.transaction.LOCK.UPDATE } : {}) }));
  }

  findAll(options: FindOptions<Attributes<M>> = {}): Promise<M[]> {
    return this.model.findAll(this.opts(options));
  }

  findWhere(where: WhereOptions<Attributes<M>>, options: FindOptions<Attributes<M>> = {}): Promise<M[]> {
    return this.model.findAll(this.opts({ ...options, where }));
  }

  findSingle(where: WhereOptions<Attributes<M>>, options: FindOptions<Attributes<M>> = {}): Promise<M | null> {
    return this.model.findOne(this.opts({ ...options, where }));
  }

  async exists(where: WhereOptions<Attributes<M>>): Promise<boolean> {
    return (await this.model.count(this.opts({ where }))) > 0;
  }

  count(where: WhereOptions<Attributes<M>> = {}): Promise<number> {
    return this.model.count(this.opts({ where }));
  }

  create(attributes: CreationAttributes<M>): Promise<M> {
    return this.model.create(attributes, this.opts({}));
  }

  bulkCreate(rows: CreationAttributes<M>[]): Promise<M[]> {
    return this.model.bulkCreate(rows, this.opts({}));
  }

  update(entity: M, attributes: Partial<Attributes<M>>): Promise<M> {
    return entity.update(attributes, this.opts({}));
  }

  async delete(entity: M): Promise<void> {
    await entity.destroy(this.opts({}));
  }

  async deleteById(id: string | number): Promise<boolean> {
    const entity = await this.findById(id);
    if (!entity) return false;
    await this.delete(entity);
    return true;
  }

  async paginate(page = 1, limit = 20, options: FindOptions<Attributes<M>> = {}): Promise<Page<M>> {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
    const { count, rows } = await this.model.findAndCountAll(
      this.opts({ ...options, limit: safeLimit, offset: (safePage - 1) * safeLimit, distinct: true }),
    );
    return { items: rows, pagination: { page: safePage, limit: safeLimit, total: count, pages: Math.ceil(count / safeLimit) } };
  }

  /**
   * Keyset pagination on (createdAt, id): stable under concurrent inserts and O(1) per page,
   * unlike OFFSET. The cursor is an opaque base64url string.
   */
  async cursorPaginate(cursor: string | null, limit = 20, where: WhereOptions<Attributes<M>> = {}): Promise<CursorPage<M>> {
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
    const conditions: unknown[] = [where];
    const decoded = cursor ? this.cursorFromString(cursor) : null;
    if (decoded) {
      conditions.push({
        [Op.or]: [{ createdAt: { [Op.lt]: decoded.createdAt } }, { createdAt: decoded.createdAt, id: { [Op.lt]: decoded.id } }],
      });
    }
    const rows = await this.model.findAll(
      this.opts({
        where: { [Op.and]: conditions } as WhereOptions<Attributes<M>>,
        order: [['createdAt', 'DESC'], ['id', 'DESC']] as Order,
        limit: safeLimit + 1,
      }),
    );
    const hasMore = rows.length > safeLimit;
    const items = rows.slice(0, safeLimit);
    const last = items[items.length - 1] as unknown as { createdAt: Date; id: string } | undefined;
    return { items, hasMore, nextCursor: hasMore && last ? this.cursorToString({ createdAt: last.createdAt, id: last.id }) : null };
  }

  cursorFromString(cursor: string): { createdAt: Date; id: string } | null {
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { t: string; id: string };
      const createdAt = new Date(parsed.t);
      return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id: parsed.id };
    } catch {
      return null;
    }
  }

  cursorToString(value: { createdAt: Date; id: string }): string {
    return Buffer.from(JSON.stringify({ t: value.createdAt.toISOString(), id: value.id })).toString('base64url');
  }
}
