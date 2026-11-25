import { DiscountType, Prisma } from '../generated/prisma/client';

export function quoteCoupon(
  coupon: Prisma.CouponGetPayload<Record<string, never>> | null,
  subtotalAmount: number,
) {
  if (
    !coupon ||
    !coupon.isActive ||
    coupon.deletedAt ||
    (coupon.startsAt && coupon.startsAt > new Date()) ||
    (coupon.expiresAt && coupon.expiresAt <= new Date()) ||
    (coupon.maxUses !== null && coupon.usesCount >= coupon.maxUses)
  ) {
    return null;
  }
  if (subtotalAmount < coupon.minimumOrderAmount) {
    return {
      code: coupon.code,
      valid: false,
      discountAmount: 0,
      reason: 'Cart does not meet the coupon minimum',
    };
  }

  const amount =
    coupon.discountType === DiscountType.PERCENTAGE
      ? Number((BigInt(subtotalAmount) * BigInt(coupon.valueAmount)) / 10_000n)
      : Math.min(subtotalAmount, coupon.valueAmount);
  const discountAmount = Math.min(
    amount,
    coupon.maxDiscountAmount ?? Number.MAX_SAFE_INTEGER,
    subtotalAmount,
  );
  return {
    code: coupon.code,
    description: coupon.description,
    valid: true,
    discountAmount,
  };
}
