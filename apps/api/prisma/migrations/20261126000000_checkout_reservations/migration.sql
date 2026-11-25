CREATE TYPE "ShippingMethod" AS ENUM ('STANDARD', 'EXPRESS');

ALTER TABLE "Inventory"
ADD COLUMN "lowStockAlertedAt" TIMESTAMP(3);

ALTER TABLE "Cart"
ADD COLUMN "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "abandonedReminderSentAt" TIMESTAMP(3);

ALTER TABLE "Order"
ADD COLUMN "shippingMethod" "ShippingMethod" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN "reservationExpiresAt" TIMESTAMP(3);

ALTER TABLE "IdempotencyKey"
ADD COLUMN "resourceId" TEXT;

CREATE INDEX "Order_status_reservationExpiresAt_idx"
ON "Order"("status", "reservationExpiresAt");
