import { randomBytes } from 'crypto';
import { Op, QueryTypes } from 'sequelize';
import { env } from '../../config/env';
import { sequelize } from '../../config/database';
import { Campaign, CampaignRecipient, Cart, CartItem, CustomerSegment, Product, User } from '../../models';
import type { SegmentCriteria } from '../../models/Platform';
import { round2 } from '../../models/fields';
import { AppError } from '../../utils/appError';
import { logger } from '../../utils/logger';
import { sendEmail, templates } from '../notifications/email';

/** Customers matching a segment's criteria (computed live from users + paid orders). */
export async function segmentMembers(criteria: SegmentCriteria): Promise<Array<{ id: string; name: string; email: string; orders: number; spent: number }>> {
  const having: string[] = [];
  const replacements: Record<string, unknown> = {};
  if (criteria.minOrders !== undefined) {
    having.push('COUNT(o.id) >= :minOrders');
    replacements.minOrders = criteria.minOrders;
  }
  if (criteria.minTotalSpent !== undefined) {
    having.push('COALESCE(SUM(o.total_amount - o.refunded_amount), 0) >= :minTotalSpent');
    replacements.minTotalSpent = criteria.minTotalSpent;
  }
  if (criteria.inactiveDays !== undefined) {
    having.push(`(MAX(o.paid_at) IS NULL OR MAX(o.paid_at) < NOW() - (:inactiveDays || ' days')::interval)`);
    replacements.inactiveDays = String(criteria.inactiveDays);
  }
  const where = ["u.role = 'customer'", 'u.is_active = TRUE'];
  if (criteria.registeredWithinDays !== undefined) {
    where.push(`u.created_at >= NOW() - (:registeredWithinDays || ' days')::interval`);
    replacements.registeredWithinDays = String(criteria.registeredWithinDays);
  }
  const rows = await sequelize.query<{ id: string; name: string; email: string; orders: string; spent: string }>(
    `SELECT u.id, u.name, u.email, COUNT(o.id) AS orders, COALESCE(SUM(o.total_amount - o.refunded_amount), 0) AS spent
       FROM users u LEFT JOIN orders o ON o.user_id = u.id AND o.payment_status IN ('paid', 'refunded')
      WHERE ${where.join(' AND ')}
      GROUP BY u.id
      ${having.length ? `HAVING ${having.join(' AND ')}` : ''}
      ORDER BY u.created_at`,
    { type: QueryTypes.SELECT, replacements },
  );
  return rows.map((r) => ({ ...r, orders: Number(r.orders), spent: round2(Number(r.spent)) }));
}

export async function refreshSegmentCount(segment: CustomerSegment): Promise<CustomerSegment> {
  const members = await segmentMembers(segment.criteria);
  return segment.update({ customerCount: members.length });
}

function trackingLinks(token: string) {
  const api = process.env.PUBLIC_API_URL ?? `http://localhost:${env.port}`;
  return {
    pixel: `${api}/api/marketing/t/${token}/open.gif`,
    click: `${api}/api/marketing/t/${token}/click?url=${encodeURIComponent(env.clientUrl)}`,
  };
}

/**
 * Sends an email campaign to its segment (or to every active customer when it has no segment).
 * Each recipient gets a row with a unique token used by the open pixel and the tracked link,
 * so open and click rates are measured. Already-sent recipients are skipped on a re-send.
 */
export async function sendCampaign(campaignId: string): Promise<Campaign> {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw AppError.notFound('Campaign not found');
  if (campaign.type !== 'email') throw AppError.badRequest(`Only email campaigns can be delivered (this store has no ${campaign.type} provider)`);
  if (campaign.status === 'sending') throw AppError.conflict('Campaign is already being sent');
  if (campaign.status === 'sent') throw AppError.conflict('Campaign was already sent');

  const segment = campaign.segmentId ? await CustomerSegment.findByPk(campaign.segmentId) : null;
  const members = await segmentMembers(segment?.criteria ?? {});
  await campaign.update({ status: 'sending' });

  let sent = 0;
  let failed = 0;
  for (const member of members) {
    const token = randomBytes(16).toString('hex');
    const [recipient, created] = await CampaignRecipient.findOrCreate({
      where: { campaignId: campaign.id, email: member.email },
      defaults: { campaignId: campaign.id, userId: member.id, email: member.email, token },
    });
    if (!created) continue;
    const links = trackingLinks(recipient.token);
    const body = campaign.content.replace(/\{\{name\}\}/g, member.name);
    const ok = await sendEmail({
      to: member.email,
      subject: campaign.subject ?? campaign.name,
      text: `${body}\n\nShop now: ${links.click}`,
      html: `<p>${body.replace(/\n/g, '<br>')}</p><p><a href="${links.click}">Shop now</a></p><img src="${links.pixel}" width="1" height="1" alt="">`,
    });
    // Without SMTP the email is logged, which still counts as handed off for local runs.
    if (ok || !env.email.host) sent++;
    else {
      failed++;
      await recipient.update({ status: 'failed', error: 'SMTP delivery failed' });
    }
  }
  return campaign.update({
    status: failed > 0 && sent === 0 ? 'failed' : 'sent',
    sentAt: new Date(),
    sentCount: campaign.sentCount + sent,
    failedCount: campaign.failedCount + failed,
  });
}

export async function recordOpen(token: string): Promise<void> {
  const recipient = await CampaignRecipient.findOne({ where: { token } });
  if (!recipient || recipient.openedAt) return;
  await recipient.update({ openedAt: new Date() });
  await Campaign.increment('openedCount', { where: { id: recipient.campaignId } });
}

/** Records a click (which implies an open) and returns a safe redirect target on the storefront. */
export async function recordClick(token: string, url: string | undefined): Promise<string> {
  const recipient = await CampaignRecipient.findOne({ where: { token } });
  if (recipient && !recipient.clickedAt) {
    const wasOpened = Boolean(recipient.openedAt);
    await recipient.update({ clickedAt: new Date(), openedAt: recipient.openedAt ?? new Date() });
    await Campaign.increment(wasOpened ? { clickedCount: 1 } : { clickedCount: 1, openedCount: 1 }, { where: { id: recipient.campaignId } });
  }
  // Only redirect to the storefront's own origin (no open redirect).
  try {
    const target = new URL(url ?? env.clientUrl, env.clientUrl);
    return target.origin === new URL(env.clientUrl).origin ? target.toString() : env.clientUrl;
  } catch {
    return env.clientUrl;
  }
}

export async function marketingAnalytics() {
  const campaigns = await Campaign.findAll({ order: [['createdAt', 'DESC']] });
  const totals = campaigns.reduce((t, c) => ({ sent: t.sent + c.sentCount, opened: t.opened + c.openedCount, clicked: t.clicked + c.clickedCount }), { sent: 0, opened: 0, clicked: 0 });
  const rate = (a: number, b: number) => (b ? round2((a / b) * 100) : 0);
  return {
    totalCampaigns: campaigns.length,
    sentCampaigns: campaigns.filter((c) => c.status === 'sent').length,
    scheduledCampaigns: campaigns.filter((c) => c.status === 'scheduled').length,
    draftCampaigns: campaigns.filter((c) => c.status === 'draft').length,
    emailsSent: totals.sent,
    openRate: rate(totals.opened, totals.sent),
    clickRate: rate(totals.clicked, totals.sent),
    clickToOpenRate: rate(totals.clicked, totals.opened),
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      sentAt: c.sentAt,
      sent: c.sentCount,
      openRate: rate(c.openedCount, c.sentCount),
      clickRate: rate(c.clickedCount, c.sentCount),
    })),
  };
}

/** Sends a reminder for signed-in carts idle longer than `idleMinutes` (once per period of inactivity). */
export async function recoverAbandonedCarts(idleMinutes = Number(process.env.ABANDONED_CART_MINUTES ?? 60)) {
  const carts = await Cart.findAll({
    where: { userId: { [Op.ne]: null }, reminderSentAt: null, lastActivityAt: { [Op.lt]: new Date(Date.now() - idleMinutes * 60_000) } },
    include: [
      { model: CartItem, as: 'items', required: true, include: [{ model: Product, as: 'product', attributes: ['name'] }] },
      { model: User, as: 'user', attributes: ['name', 'email', 'isActive'] },
    ],
    limit: 200,
  });
  let reminded = 0;
  for (const cart of carts) {
    const user = (cart as unknown as { user?: User }).user;
    const items = (cart as unknown as { items: Array<CartItem & { product?: Product }> }).items;
    if (!user?.isActive) continue;
    await sendEmail({ to: user.email, ...templates.abandonedCart(user.name, items.map((i) => ({ name: i.product?.name ?? 'Item', quantity: i.quantity })), `${env.clientUrl}/cart`) });
    await cart.update({ reminderSentAt: new Date() }, { silent: true });
    reminded++;
  }
  if (reminded) logger.info(`Abandoned cart reminders sent: ${reminded}`);
  return { checked: carts.length, reminded, idleMinutes };
}

/** Job: sends campaigns whose scheduled time has passed. */
export async function sendDueCampaigns(): Promise<number> {
  const due = await Campaign.findAll({ where: { status: 'scheduled', scheduledAt: { [Op.lte]: new Date() } } });
  for (const c of due) {
    await sendCampaign(c.id).catch((error) => logger.error('Scheduled campaign failed', { campaignId: c.id, error: error instanceof Error ? error.message : String(error) }));
  }
  return due.length;
}
