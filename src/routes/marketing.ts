import { Router } from 'express';
import { z } from 'zod';
import { Campaign, CampaignRecipient, CustomerSegment } from '../models';
import { adminOnly } from '../middleware/auth';
import { s, validate } from '../middleware/validate';
import {
  marketingAnalytics,
  recordClick,
  recordOpen,
  recoverAbandonedCarts,
  refreshSegmentCount,
  segmentMembers,
  sendCampaign,
} from '../services/marketing/marketingService';
import { AppError } from '../utils/appError';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

/* Public tracking endpoints used by campaign emails. */
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
router.get(
  '/t/:token/open.gif',
  asyncHandler(async (req, res) => {
    if (/^[a-f0-9]{32}$/.test(req.params.token)) await recordOpen(req.params.token);
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store');
    res.end(PIXEL);
  }),
);
router.get(
  '/t/:token/click',
  asyncHandler(async (req, res) => {
    const target = /^[a-f0-9]{32}$/.test(req.params.token) ? await recordClick(req.params.token, typeof req.query.url === 'string' ? req.query.url : undefined) : undefined;
    res.redirect(302, target ?? '/');
  }),
);

router.use(...adminOnly);

const criteriaSchema = z
  .object({
    minOrders: z.number().int().min(0).optional(),
    minTotalSpent: z.number().min(0).optional(),
    inactiveDays: z.number().int().min(1).optional(),
    registeredWithinDays: z.number().int().min(1).optional(),
  })
  .strict();

const campaignSchema = z.object({
  name: z.string().trim().min(2).max(160),
  type: z.enum(['email', 'sms', 'push', 'social']).default('email'),
  subject: z.string().max(255).nullable().optional(),
  content: z.string().min(1).max(20_000),
  segmentId: s.uuid.nullable().optional(),
  scheduledAt: z.coerce.date().nullable().optional(),
});

router.get('/campaigns', asyncHandler(async (_req, res) => void res.json({ success: true, data: await Campaign.findAll({ include: [{ model: CustomerSegment, as: 'segment', attributes: ['id', 'name'] }], order: [['createdAt', 'DESC']] }) })));

router.get(
  '/campaigns/:id',
  validate(s.idParam, 'params'),
  asyncHandler(async (req, res) => {
    const campaign = await Campaign.findByPk(req.params.id, { include: [{ model: CustomerSegment, as: 'segment' }] });
    if (!campaign) throw AppError.notFound('Campaign not found');
    const recipients = await CampaignRecipient.findAll({ where: { campaignId: campaign.id }, attributes: ['email', 'status', 'sentAt', 'openedAt', 'clickedAt'], order: [['sentAt', 'DESC']], limit: 200 });
    res.json({ success: true, data: { ...campaign.toJSON(), recipients } });
  }),
);

router.post(
  '/campaigns',
  validate(campaignSchema),
  asyncHandler(async (req, res) => {
    if (req.body.segmentId && !(await CustomerSegment.findByPk(req.body.segmentId))) throw AppError.badRequest('Segment not found');
    if (req.body.scheduledAt && req.body.scheduledAt <= new Date()) throw AppError.badRequest('scheduledAt must be in the future');
    const campaign = await Campaign.create({ ...req.body, status: req.body.scheduledAt ? 'scheduled' : 'draft' });
    res.status(201).json({ success: true, data: campaign });
  }),
);

router.put(
  '/campaigns/:id',
  validate(s.idParam, 'params'),
  validate(campaignSchema.partial()),
  asyncHandler(async (req, res) => {
    const campaign = await Campaign.findByPk(req.params.id);
    if (!campaign) throw AppError.notFound('Campaign not found');
    if (!['draft', 'scheduled', 'paused'].includes(campaign.status)) throw AppError.conflict(`A ${campaign.status} campaign cannot be edited`);
    const scheduledAt = req.body.scheduledAt === undefined ? campaign.scheduledAt : req.body.scheduledAt;
    await campaign.update({ ...req.body, status: scheduledAt ? 'scheduled' : 'draft' });
    res.json({ success: true, data: campaign });
  }),
);

router.post('/campaigns/:id/send', validate(s.idParam, 'params'), asyncHandler(async (req, res) => void res.json({ success: true, message: 'Campaign sent', data: await sendCampaign(req.params.id) })));

router.post(
  '/campaigns/:id/pause',
  validate(s.idParam, 'params'),
  asyncHandler(async (req, res) => {
    const campaign = await Campaign.findByPk(req.params.id);
    if (!campaign || campaign.status !== 'scheduled') throw AppError.conflict('Only scheduled campaigns can be paused');
    res.json({ success: true, data: await campaign.update({ status: 'paused' }) });
  }),
);

router.delete(
  '/campaigns/:id',
  validate(s.idParam, 'params'),
  asyncHandler(async (req, res) => {
    const campaign = await Campaign.findByPk(req.params.id);
    if (!campaign) throw AppError.notFound('Campaign not found');
    if (campaign.status === 'sending') throw AppError.conflict('Campaign is being sent');
    await campaign.destroy();
    res.json({ success: true, message: 'Campaign deleted' });
  }),
);

router.get('/segments', asyncHandler(async (_req, res) => void res.json({ success: true, data: await CustomerSegment.findAll({ order: [['name', 'ASC']] }) })));

router.post(
  '/segments',
  validate(z.object({ name: z.string().trim().min(2).max(120), description: z.string().max(1000).nullable().optional(), criteria: criteriaSchema.default({}) })),
  asyncHandler(async (req, res) => {
    const segment = await CustomerSegment.create(req.body);
    res.status(201).json({ success: true, data: await refreshSegmentCount(segment) });
  }),
);

router.put(
  '/segments/:id',
  validate(s.idParam, 'params'),
  validate(z.object({ name: z.string().trim().min(2).max(120).optional(), description: z.string().max(1000).nullable().optional(), criteria: criteriaSchema.optional(), isActive: z.boolean().optional() })),
  asyncHandler(async (req, res) => {
    const segment = await CustomerSegment.findByPk(req.params.id);
    if (!segment) throw AppError.notFound('Segment not found');
    await segment.update(req.body);
    res.json({ success: true, data: await refreshSegmentCount(segment) });
  }),
);

router.get(
  '/segments/:id/members',
  validate(s.idParam, 'params'),
  asyncHandler(async (req, res) => {
    const segment = await CustomerSegment.findByPk(req.params.id);
    if (!segment) throw AppError.notFound('Segment not found');
    const members = await segmentMembers(segment.criteria);
    await segment.update({ customerCount: members.length });
    res.json({ success: true, data: { segment, count: members.length, members: members.slice(0, 500) } });
  }),
);

router.delete(
  '/segments/:id',
  validate(s.idParam, 'params'),
  asyncHandler(async (req, res) => {
    const removed = await CustomerSegment.destroy({ where: { id: req.params.id } });
    if (!removed) throw AppError.notFound('Segment not found');
    res.json({ success: true, message: 'Segment deleted (its campaigns now target all customers)' });
  }),
);

router.post(
  '/abandoned-cart',
  validate(z.object({ idleMinutes: z.number().int().min(1).max(60 * 24 * 30).optional() })),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await recoverAbandonedCarts(req.body.idleMinutes) });
  }),
);

router.get('/analytics', asyncHandler(async (_req, res) => void res.json({ success: true, data: await marketingAnalytics() })));

export default router;
