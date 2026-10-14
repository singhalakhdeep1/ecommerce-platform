import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { uuidPk } from './fields';

/* ---------- Analytics ---------- */

export class AnalyticsEvent extends Model<InferAttributes<AnalyticsEvent>, InferCreationAttributes<AnalyticsEvent>> {
  declare id: CreationOptional<string>;
  declare userId: CreationOptional<string | null>;
  declare sessionId: CreationOptional<string | null>;
  declare eventType: string;
  declare eventData: CreationOptional<Record<string, unknown> | null>;
  declare abGroup: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
}

AnalyticsEvent.init(
  {
    id: uuidPk,
    userId: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    sessionId: { type: DataTypes.STRING(64) },
    eventType: { type: DataTypes.STRING(64), allowNull: false },
    eventData: { type: DataTypes.JSONB },
    abGroup: { type: DataTypes.STRING(16) },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'analytics_events', updatedAt: false },
);

/* ---------- Outgoing webhooks ---------- */

export class WebhookSubscription extends Model<InferAttributes<WebhookSubscription>, InferCreationAttributes<WebhookSubscription>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare targetUrl: string;
  declare event: string;
  declare secret: string;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

WebhookSubscription.init(
  {
    id: uuidPk,
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    targetUrl: { type: DataTypes.STRING(2048), allowNull: false, validate: { isUrl: true } },
    event: { type: DataTypes.STRING(64), allowNull: false },
    secret: { type: DataTypes.STRING(128), allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'webhook_subscriptions' },
);

export class WebhookDelivery extends Model<InferAttributes<WebhookDelivery>, InferCreationAttributes<WebhookDelivery>> {
  declare id: CreationOptional<string>;
  declare subscriptionId: string;
  declare event: string;
  declare status: 'pending' | 'delivered' | 'failed';
  declare attempts: CreationOptional<number>;
  declare responseStatus: CreationOptional<number | null>;
  declare lastError: CreationOptional<string | null>;
  declare nextAttemptAt: CreationOptional<Date | null>;
  declare payload: Record<string, unknown>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

WebhookDelivery.init(
  {
    id: uuidPk,
    subscriptionId: { type: DataTypes.UUID, allowNull: false, references: { model: 'webhook_subscriptions', key: 'id' }, onDelete: 'CASCADE' },
    event: { type: DataTypes.STRING(64), allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'delivered', 'failed'), allowNull: false, defaultValue: 'pending' },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    responseStatus: { type: DataTypes.INTEGER },
    lastError: { type: DataTypes.TEXT },
    nextAttemptAt: { type: DataTypes.DATE },
    payload: { type: DataTypes.JSONB, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'webhook_deliveries' },
);

/* ---------- Marketing ---------- */

export interface SegmentCriteria {
  minOrders?: number;
  minTotalSpent?: number;
  /** Customers whose last order is older than this many days. */
  inactiveDays?: number;
  /** Customers registered within the last N days. */
  registeredWithinDays?: number;
}

export class CustomerSegment extends Model<InferAttributes<CustomerSegment>, InferCreationAttributes<CustomerSegment>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare description: CreationOptional<string | null>;
  declare criteria: CreationOptional<SegmentCriteria>;
  declare customerCount: CreationOptional<number>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

CustomerSegment.init(
  {
    id: uuidPk,
    name: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    description: { type: DataTypes.TEXT },
    criteria: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    customerCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'customer_segments' },
);

export class Campaign extends Model<InferAttributes<Campaign>, InferCreationAttributes<Campaign>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare type: CreationOptional<'email' | 'sms' | 'push' | 'social'>;
  declare subject: CreationOptional<string | null>;
  declare content: string;
  declare segmentId: CreationOptional<string | null>;
  declare status: CreationOptional<'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'failed'>;
  declare scheduledAt: CreationOptional<Date | null>;
  declare sentAt: CreationOptional<Date | null>;
  declare sentCount: CreationOptional<number>;
  declare failedCount: CreationOptional<number>;
  declare openedCount: CreationOptional<number>;
  declare clickedCount: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Campaign.init(
  {
    id: uuidPk,
    name: { type: DataTypes.STRING(160), allowNull: false },
    type: { type: DataTypes.ENUM('email', 'sms', 'push', 'social'), allowNull: false, defaultValue: 'email' },
    subject: { type: DataTypes.STRING(255) },
    content: { type: DataTypes.TEXT, allowNull: false },
    segmentId: { type: DataTypes.UUID, references: { model: 'customer_segments', key: 'id' }, onDelete: 'SET NULL' },
    status: { type: DataTypes.ENUM('draft', 'scheduled', 'sending', 'sent', 'paused', 'failed'), allowNull: false, defaultValue: 'draft' },
    scheduledAt: { type: DataTypes.DATE },
    sentAt: { type: DataTypes.DATE },
    sentCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    failedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    openedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    clickedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'campaigns' },
);

/* ---------- A/B testing ---------- */

export class AbExperiment extends Model<InferAttributes<AbExperiment>, InferCreationAttributes<AbExperiment>> {
  declare key: string;
  declare name: string;
  declare description: CreationOptional<string | null>;
  declare variants: string[];
  declare active: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

AbExperiment.init(
  {
    key: { type: DataTypes.STRING(80), primaryKey: true },
    name: { type: DataTypes.STRING(160), allowNull: false },
    description: { type: DataTypes.TEXT },
    variants: { type: DataTypes.ARRAY(DataTypes.STRING), allowNull: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'ab_experiments' },
);

export class AbAssignment extends Model<InferAttributes<AbAssignment>, InferCreationAttributes<AbAssignment>> {
  declare id: CreationOptional<string>;
  declare experimentKey: string;
  /** User id for signed-in visitors, otherwise the session id / IP. */
  declare subjectKey: string;
  declare variant: string;
  declare conversions: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
}

AbAssignment.init(
  {
    id: uuidPk,
    experimentKey: { type: DataTypes.STRING(80), allowNull: false, references: { model: 'ab_experiments', key: 'key' }, onDelete: 'CASCADE' },
    subjectKey: { type: DataTypes.STRING(80), allowNull: false },
    variant: { type: DataTypes.STRING(40), allowNull: false },
    conversions: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'ab_assignments', updatedAt: false },
);

/* ---------- Infrastructure ---------- */

/** Persistent record of every saga run (steps completed, compensations, outcome). */
export class SagaExecution extends Model<InferAttributes<SagaExecution>, InferCreationAttributes<SagaExecution>> {
  declare id: string;
  declare sagaName: string;
  declare status: 'running' | 'completed' | 'compensated' | 'failed';
  declare completedSteps: CreationOptional<string[]>;
  declare compensatedSteps: CreationOptional<string[]>;
  declare failedStep: CreationOptional<string | null>;
  declare error: CreationOptional<string | null>;
  declare startedAt: Date;
  declare finishedAt: CreationOptional<Date | null>;
}

SagaExecution.init(
  {
    id: { type: DataTypes.STRING(64), primaryKey: true },
    sagaName: { type: DataTypes.STRING(80), allowNull: false },
    status: { type: DataTypes.ENUM('running', 'completed', 'compensated', 'failed'), allowNull: false },
    completedSteps: { type: DataTypes.ARRAY(DataTypes.STRING), allowNull: false, defaultValue: [] },
    compensatedSteps: { type: DataTypes.ARRAY(DataTypes.STRING), allowNull: false, defaultValue: [] },
    failedStep: { type: DataTypes.STRING(80) },
    error: { type: DataTypes.TEXT },
    startedAt: { type: DataTypes.DATE, allowNull: false },
    finishedAt: { type: DataTypes.DATE },
  },
  { sequelize, tableName: 'saga_executions', timestamps: false },
);

/** Provider event ids already handled, so a re-delivered Stripe/PayPal webhook is acknowledged but not re-applied. */
export class ProcessedWebhookEvent extends Model<InferAttributes<ProcessedWebhookEvent>, InferCreationAttributes<ProcessedWebhookEvent>> {
  declare eventId: string;
  declare provider: string;
  declare type: string;
  declare processedAt: CreationOptional<Date>;
}

ProcessedWebhookEvent.init(
  {
    eventId: { type: DataTypes.STRING(128), primaryKey: true },
    provider: { type: DataTypes.STRING(32), allowNull: false },
    type: { type: DataTypes.STRING(80), allowNull: false },
    processedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'processed_webhook_events', timestamps: false },
);
