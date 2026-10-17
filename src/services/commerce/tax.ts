import type { Address } from '../../models/User';
import { round2 } from '../../models/fields';

/**
 * Destination-based sales tax / VAT from rate tables. Base state rates only (no county/city
 * surcharges): a production store would swap this module for Avalara/Stripe Tax behind the same API.
 */
const US_STATE_RATES: Record<string, number> = {
  AL: 0.04, AK: 0, AZ: 0.056, AR: 0.065, CA: 0.0725, CO: 0.029, CT: 0.0635, DE: 0, FL: 0.06, GA: 0.04,
  HI: 0.04, ID: 0.06, IL: 0.0625, IN: 0.07, IA: 0.06, KS: 0.065, KY: 0.06, LA: 0.0445, ME: 0.055, MD: 0.06,
  MA: 0.0625, MI: 0.06, MN: 0.06875, MS: 0.07, MO: 0.04225, MT: 0, NE: 0.055, NV: 0.0685, NH: 0, NJ: 0.06625,
  NM: 0.05125, NY: 0.04, NC: 0.0475, ND: 0.05, OH: 0.0575, OK: 0.045, OR: 0, PA: 0.06, RI: 0.07, SC: 0.06,
  SD: 0.045, TN: 0.07, TX: 0.0625, UT: 0.0595, VT: 0.06, VA: 0.053, WA: 0.065, WV: 0.06, WI: 0.05, WY: 0.04,
  DC: 0.06,
};

const COUNTRY_RATES: Record<string, { rate: number; type: string }> = {
  CA: { rate: 0.05, type: 'GST' }, GB: { rate: 0.2, type: 'VAT' }, DE: { rate: 0.19, type: 'VAT' }, FR: { rate: 0.2, type: 'VAT' },
  IT: { rate: 0.22, type: 'VAT' }, ES: { rate: 0.21, type: 'VAT' }, NL: { rate: 0.21, type: 'VAT' }, BE: { rate: 0.21, type: 'VAT' },
  AT: { rate: 0.2, type: 'VAT' }, SE: { rate: 0.25, type: 'VAT' }, NO: { rate: 0.25, type: 'VAT' }, DK: { rate: 0.25, type: 'VAT' },
  FI: { rate: 0.24, type: 'VAT' }, IE: { rate: 0.23, type: 'VAT' }, PT: { rate: 0.23, type: 'VAT' }, PL: { rate: 0.23, type: 'VAT' },
  CZ: { rate: 0.21, type: 'VAT' }, GR: { rate: 0.24, type: 'VAT' }, HU: { rate: 0.27, type: 'VAT' }, RO: { rate: 0.19, type: 'VAT' },
  CH: { rate: 0.081, type: 'VAT' }, AU: { rate: 0.1, type: 'GST' }, NZ: { rate: 0.15, type: 'GST' }, JP: { rate: 0.1, type: 'Consumption tax' },
  KR: { rate: 0.1, type: 'VAT' }, CN: { rate: 0.13, type: 'VAT' }, IN: { rate: 0.18, type: 'GST' }, SG: { rate: 0.09, type: 'GST' },
  MY: { rate: 0.06, type: 'SST' }, TH: { rate: 0.07, type: 'VAT' }, ID: { rate: 0.11, type: 'VAT' }, PH: { rate: 0.12, type: 'VAT' },
  VN: { rate: 0.1, type: 'VAT' }, AE: { rate: 0.05, type: 'VAT' }, SA: { rate: 0.15, type: 'VAT' }, ZA: { rate: 0.15, type: 'VAT' },
  MX: { rate: 0.16, type: 'IVA' }, BR: { rate: 0.17, type: 'ICMS' }, AR: { rate: 0.21, type: 'IVA' }, CL: { rate: 0.19, type: 'IVA' },
  CO: { rate: 0.19, type: 'IVA' }, TR: { rate: 0.2, type: 'KDV' }, IL: { rate: 0.17, type: 'VAT' }, EG: { rate: 0.14, type: 'VAT' },
  KE: { rate: 0.16, type: 'VAT' }, NG: { rate: 0.075, type: 'VAT' },
};

export interface TaxResult {
  taxRate: number;
  taxAmount: number;
  taxType: string;
  jurisdiction: string;
  isTaxExempt: boolean;
}

export function calculateTax(subtotal: number, address?: Address | null): TaxResult {
  const country = address?.country?.trim().toUpperCase();
  if (!country) return { taxRate: 0, taxAmount: 0, taxType: 'none', jurisdiction: 'unknown', isTaxExempt: true };
  const state = address?.state?.trim().toUpperCase();
  let rate = 0;
  let type = 'none';
  let jurisdiction = country;
  if (country === 'US') {
    rate = state ? US_STATE_RATES[state] ?? 0 : 0;
    type = 'sales tax';
    jurisdiction = state ? `US-${state}` : 'US';
  } else if (COUNTRY_RATES[country]) {
    rate = COUNTRY_RATES[country].rate;
    type = COUNTRY_RATES[country].type;
  }
  return { taxRate: round2(rate * 100), taxAmount: round2(subtotal * rate), taxType: type, jurisdiction, isTaxExempt: rate === 0 };
}

export function getTaxRate(country: string, state?: string): number {
  return calculateTax(100, { country, state }).taxRate;
}

export function supportedJurisdictions() {
  return {
    usStates: Object.keys(US_STATE_RATES).sort(),
    countries: ['US', ...Object.keys(COUNTRY_RATES)].sort(),
  };
}
