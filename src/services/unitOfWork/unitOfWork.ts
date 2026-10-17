import { Model, ModelStatic, Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
import { Repository } from '../repository/repository';

/**
 * Unit of Work: one database transaction shared by every repository it hands out. `run` commits
 * when the callback resolves and rolls back when it throws, so multi-table changes (stock, order,
 * items, redemptions, cart) land together or not at all.
 */
export class UnitOfWork {
  private readonly repositories = new Map<ModelStatic<Model>, Repository<Model>>();
  private readonly afterCommitHooks: Array<() => void | Promise<void>> = [];

  private constructor(readonly transaction: Transaction) {}

  static async run<T>(work: (uow: UnitOfWork) => Promise<T>, options: { isolationLevel?: Transaction.ISOLATION_LEVELS } = {}): Promise<T> {
    let uow: UnitOfWork | undefined;
    const result = await sequelize.transaction({ isolationLevel: options.isolationLevel }, async (transaction) => {
      uow = new UnitOfWork(transaction);
      return work(uow);
    });
    // Side effects (emails, webhooks, search indexing) only after the data is durable.
    for (const hook of uow?.afterCommitHooks ?? []) {
      await Promise.resolve(hook()).catch(() => undefined);
    }
    return result;
  }

  repository<M extends Model>(model: ModelStatic<M>): Repository<M> {
    let repo = this.repositories.get(model as unknown as ModelStatic<Model>);
    if (!repo) {
      repo = new Repository(model as unknown as ModelStatic<Model>, this.transaction);
      this.repositories.set(model as unknown as ModelStatic<Model>, repo);
    }
    return repo as unknown as Repository<M>;
  }

  afterCommit(hook: () => void | Promise<void>): void {
    this.afterCommitHooks.push(hook);
  }

  get lock() {
    return this.transaction.LOCK.UPDATE;
  }
}
