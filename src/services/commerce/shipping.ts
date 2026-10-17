import { randomBytes } from 'crypto';
import type { Address } from '../../models/User';
import { round2 } from '../../models/fields';

export type ServiceType = 'ground' | 'express' | 'overnight';
export const SERVICE_TYPES: ServiceType[] = ['ground', 'express', 'overnight'];

interface Carrier {
  name: string;
  baseRate: number;
  ratePerKg: number;
  ratePerZone: number;
  freeShippingThreshold: number;
  deliveryDays: Record<ServiceType, [number, number]>;
}

/** Store-negotiated rate cards (flat base + weight + zone). Live carrier quotes go through Shippo when configured. */
export const CARRIERS: Record<string, Carrier> = {
  usps: { name: 'USPS', baseRate: 4.99, ratePerKg: 0.9, ratePerZone: 1.5, freeShippingThreshold: 50, deliveryDays: { ground: [3, 7], express: [2, 3], overnight: [1, 2] } },
  ups: { name: 'UPS', baseRate: 6.99, ratePerKg: 1.0, ratePerZone: 1.8, freeShippingThreshold: 80, deliveryDays: { ground: [2, 5], express: [1, 3], overnight: [1, 1] } },
  fedex: { name: 'FedEx', baseRate: 5.99, ratePerKg: 1.1, ratePerZone: 2.0, freeShippingThreshold: 75, deliveryDays: { ground: [3, 5], express: [1, 2], overnight: [1, 1] } },
  dhl: { name: 'DHL', baseRate: 7.99, ratePerKg: 1.2, ratePerZone: 2.2, freeShippingThreshold: 100, deliveryDays: { ground: [4, 7], express: [2, 3], overnight: [1, 1] } },
};

const SERVICE_MULTIPLIER: Record<ServiceType, number> = { ground: 1, express: 1.5, overnight: 2.5 };

/** Warehouse the store ships from. */
const ORIGIN = {
  country: (process.env.WAREHOUSE_COUNTRY ?? 'US').toUpperCase(),
  state: (process.env.WAREHOUSE_STATE ?? 'CA').toUpperCase(),
};

/** 1 = same state, 2 = same country, 3 = international. */
export function shippingZone(destination?: Address | null): 1 | 2 | 3 {
  const country = destination?.country?.toUpperCase();
  if (!country || country !== ORIGIN.country) return country ? 3 : 2;
  return destination?.state?.toUpperCase() === ORIGIN.state ? 1 : 2;
}

export interface ShippingQuote {
  provider: string;
  providerCode: string;
  serviceType: ServiceType;
  cost: number;
  isFreeShipping: boolean;
  estimatedDelivery: string;
  freeShippingThreshold: number;
  zone: number;
}

export function quote(providerCode: string, opts: { weightKg: number; subtotal: number; serviceType: ServiceType; address?: Address | null }): ShippingQuote {
  const carrier = CARRIERS[providerCode.toLowerCase()];
  if (!carrier) throw new Error(`Unknown shipping provider: ${providerCode}`);
  const zone = shippingZone(opts.address);
  const [minDays, maxDays] = carrier.deliveryDays[opts.serviceType];
  const estimatedDelivery = minDays === maxDays ? `${minDays} business day${minDays > 1 ? 's' : ''}` : `${minDays}-${maxDays} business days`;
  // Free shipping only applies to domestic ground.
  const free = opts.serviceType === 'ground' && zone < 3 && opts.subtotal >= carrier.freeShippingThreshold;
  let cost = 0;
  if (!free) {
    cost = (carrier.baseRate + Math.max(0.1, opts.weightKg) * carrier.ratePerKg + zone * carrier.ratePerZone) * SERVICE_MULTIPLIER[opts.serviceType];
    if (zone === 3) cost *= 2;
  }
  return {
    provider: carrier.name,
    providerCode: providerCode.toLowerCase(),
    serviceType: opts.serviceType,
    cost: round2(cost),
    isFreeShipping: free,
    estimatedDelivery,
    freeShippingThreshold: carrier.freeShippingThreshold,
    zone,
  };
}

export function allQuotes(opts: { weightKg: number; subtotal: number; address?: Address | null; serviceType?: ServiceType }): ShippingQuote[] {
  const services = opts.serviceType ? [opts.serviceType] : SERVICE_TYPES;
  const quotes: ShippingQuote[] = [];
  for (const code of Object.keys(CARRIERS)) for (const serviceType of services) quotes.push(quote(code, { ...opts, serviceType }));
  return quotes.sort((a, b) => a.cost - b.cost);
}

export function validateAddress(address: Partial<Address> | undefined | null): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  const street = address?.address ?? address?.street;
  if (!address?.name || address.name.trim().length < 2) errors.push('Name is required');
  if (!street || street.trim().length < 5) errors.push('Street address is required');
  if (!address?.city || address.city.trim().length < 2) errors.push('City is required');
  if (!address?.zip || address.zip.trim().length < 3) errors.push('Postal code is required');
  if (!address?.country || address.country.trim().length !== 2) errors.push('Country must be a 2-letter ISO code');
  if (address?.country?.toUpperCase() === 'US' && (!address.state || address.state.trim().length !== 2)) errors.push('US addresses need a 2-letter state code');
  return { isValid: errors.length === 0, errors };
}

export function generateTrackingNumber(providerCode: string): string {
  const prefix: Record<string, string> = { fedex: 'FX', ups: '1Z', usps: '94', dhl: 'JD' };
  return `${prefix[providerCode] ?? 'TRK'}${randomBytes(8).toString('hex').toUpperCase()}`;
}

export function deliveryWindow(providerCode: string, serviceType: ServiceType, from: Date): { earliest: Date; latest: Date } {
  const carrier = CARRIERS[providerCode] ?? CARRIERS.usps;
  const [min, max] = carrier.deliveryDays[serviceType] ?? carrier.deliveryDays.ground;
  const addBusinessDays = (date: Date, days: number) => {
    const d = new Date(date);
    let added = 0;
    while (added < days) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) added++;
    }
    return d;
  };
  return { earliest: addBusinessDays(from, min), latest: addBusinessDays(from, max) };
}
