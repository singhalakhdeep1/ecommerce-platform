import { createHash } from 'crypto';
import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { AbAssignment, AbExperiment } from '../../models';
import { AppError } from '../../utils/appError';

/** Deterministic bucket in [0, n): the same subject always lands in the same variant. */
export function bucket(subjectKey: string, experimentKey: string, n: number): number {
  return createHash('sha256').update(`${experimentKey}:${subjectKey}`).digest().readUInt32BE(0) % n;
}

export async function assignVariant(experimentKey: string, subjectKey: string): Promise<{ experiment: string; variant: string; active: boolean }> {
  const experiment = await AbExperiment.findByPk(experimentKey);
  if (!experiment) throw AppError.notFound(`Experiment ${experimentKey} not found`);
  if (!experiment.active) return { experiment: experimentKey, variant: experiment.variants[0], active: false };
  const existing = await AbAssignment.findOne({ where: { experimentKey, subjectKey } });
  if (existing) return { experiment: experimentKey, variant: existing.variant, active: true };
  const variant = experiment.variants[bucket(subjectKey, experimentKey, experiment.variants.length)];
  // ON CONFLICT DO NOTHING keeps the first assignment if two requests race.
  await sequelize.query(
    `INSERT INTO ab_assignments (id, experiment_key, subject_key, variant, conversions, created_at)
     VALUES (gen_random_uuid(), :experimentKey, :subjectKey, :variant, 0, NOW())
     ON CONFLICT (experiment_key, subject_key) DO NOTHING`,
    { replacements: { experimentKey, subjectKey, variant } },
  );
  const row = await AbAssignment.findOne({ where: { experimentKey, subjectKey } });
  return { experiment: experimentKey, variant: row?.variant ?? variant, active: true };
}

export async function trackConversion(experimentKey: string, subjectKey: string): Promise<boolean> {
  const [, affected] = await AbAssignment.increment('conversions', { by: 1, where: { experimentKey, subjectKey } }) as unknown as [unknown, number];
  return (affected ?? 0) > 0;
}

/** On purchase: every active experiment the buyer is enrolled in records a conversion. */
export async function trackPurchaseConversions(subjectKeys: string[]): Promise<number> {
  if (subjectKeys.length === 0) return 0;
  const [, affected] = (await AbAssignment.increment('conversions', {
    by: 1,
    where: {
      subjectKey: { [Op.in]: subjectKeys },
      experimentKey: { [Op.in]: sequelize.literal(`(SELECT key FROM ab_experiments WHERE active = TRUE)`) },
    },
  })) as unknown as [unknown, number];
  return affected ?? 0;
}

/** Standard normal CDF (Abramowitz-Stegun 26.2.17). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

export interface VariantStats {
  variant: string;
  assignments: number;
  converters: number;
  conversions: number;
  conversionRate: number;
}

/**
 * Per-variant conversion rate (share of assigned subjects with at least one conversion) and a
 * two-proportion z-test of each variant against the first (control). Significant when p < 0.05
 * and each arm has at least 30 subjects.
 */
export async function experimentStats(experimentKey: string) {
  const experiment = await AbExperiment.findByPk(experimentKey);
  if (!experiment) throw AppError.notFound(`Experiment ${experimentKey} not found`);
  const rows = await sequelize.query<{ variant: string; assignments: string; converters: string; conversions: string }>(
    `SELECT variant, COUNT(*) AS assignments, COUNT(*) FILTER (WHERE conversions > 0) AS converters, COALESCE(SUM(conversions), 0) AS conversions
       FROM ab_assignments WHERE experiment_key = :experimentKey GROUP BY variant`,
    { type: QueryTypes.SELECT, replacements: { experimentKey } },
  );
  const stats: VariantStats[] = experiment.variants.map((variant) => {
    const r = rows.find((x) => x.variant === variant);
    const assignments = Number(r?.assignments ?? 0);
    const converters = Number(r?.converters ?? 0);
    return { variant, assignments, converters, conversions: Number(r?.conversions ?? 0), conversionRate: assignments ? Math.round((converters / assignments) * 10_000) / 100 : 0 };
  });

  const control = stats[0];
  const comparisons = stats.slice(1).map((treatment) => {
    const n1 = control.assignments;
    const n2 = treatment.assignments;
    if (n1 < 30 || n2 < 30) return { variant: treatment.variant, significant: false, pValue: null, lift: null, message: 'Sample size too small (need 30+ per variant)' };
    const p1 = control.converters / n1;
    const p2 = treatment.converters / n2;
    const pooled = (control.converters + treatment.converters) / (n1 + n2);
    const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
    const z = se === 0 ? 0 : (p2 - p1) / se;
    const pValue = 2 * (1 - normalCdf(Math.abs(z)));
    return {
      variant: treatment.variant,
      zScore: Math.round(z * 1000) / 1000,
      pValue: Math.round(pValue * 10_000) / 10_000,
      lift: p1 === 0 ? null : Math.round(((p2 - p1) / p1) * 10_000) / 100,
      significant: pValue < 0.05,
      message: pValue < 0.05 ? `${treatment.variant} differs from ${control.variant} (p < 0.05)` : 'No statistically significant difference yet',
    };
  });
  return { experiment: { key: experiment.key, name: experiment.name, active: experiment.active, variants: experiment.variants }, variants: stats, comparisons };
}
