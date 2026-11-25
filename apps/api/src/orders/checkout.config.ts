import { ShippingMethod } from '../generated/prisma/client';

const MAX_DATABASE_AMOUNT = 2_147_483_647;

function integerSetting(name: string, defaultValue: number, maximum: number) {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? defaultValue : Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error(`${name} must be an integer between 0 and ${maximum}`);
  }
  return value;
}

export function getCheckoutConfig() {
  const currency = (process.env.CURRENCY ?? 'USD').toUpperCase();
  if (currency !== 'USD') {
    throw new Error('CURRENCY currently supports USD only');
  }
  return {
    currency,
    taxRateBasisPoints: integerSetting('TAX_RATE_BPS', 0, 10_000),
    standardShippingAmount: integerSetting(
      'SHIPPING_STANDARD_AMOUNT',
      599,
      MAX_DATABASE_AMOUNT,
    ),
    expressShippingAmount: integerSetting(
      'SHIPPING_EXPRESS_AMOUNT',
      1299,
      MAX_DATABASE_AMOUNT,
    ),
    reservationMinutes: integerSetting('PAYMENT_RESERVATION_MINUTES', 30, 1440),
    abandonedCartHours: integerSetting('ABANDONED_CART_HOURS', 24, 720),
    lowStockThreshold: integerSetting('LOW_STOCK_THRESHOLD', 5, 1_000_000),
    lowStockAlertEmail: process.env.LOW_STOCK_ALERT_EMAIL,
  };
}

export function shippingAmount(method: ShippingMethod) {
  const config = getCheckoutConfig();
  return method === ShippingMethod.EXPRESS
    ? config.expressShippingAmount
    : config.standardShippingAmount;
}

export function taxAmount(taxableAmount: number, rateBasisPoints: number) {
  return Number(
    (BigInt(taxableAmount) * BigInt(rateBasisPoints) + 5000n) / 10_000n,
  );
}
