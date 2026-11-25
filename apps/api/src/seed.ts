import './environment';
import 'reflect-metadata';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import {
  OrderStatus,
  PrismaClient,
  ProductStatus,
  UserRole,
} from './generated/prisma/client';

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set before the database seed can run`);
  }
  return value;
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: requiredEnvironment('DATABASE_URL'),
  }),
});

const categories = [
  { name: 'Apparel', slug: 'apparel' },
  { name: 'Footwear', slug: 'footwear' },
  { name: 'Accessories', slug: 'accessories' },
  { name: 'Home & Living', slug: 'home-living' },
  { name: 'Electronics', slug: 'electronics' },
  { name: 'Beauty & Care', slug: 'beauty-care' },
  { name: 'Outdoors', slug: 'outdoors' },
  { name: 'Books & Stationery', slug: 'books-stationery' },
];

const products = [
  ['organic-cotton-crew-tee', 'Organic Cotton Crew Tee', 'apparel', 'Northline', 2800],
  ['merino-knit-sweater', 'Merino Wool Knit Sweater', 'apparel', 'Northline', 8900],
  ['classic-denim-jacket', 'Classic Denim Jacket', 'apparel', 'Fieldwork', 9800],
  ['linen-weekend-shirt', 'Linen Weekend Shirt', 'apparel', 'Fieldwork', 6400],
  ['everyday-chino', 'Everyday Stretch Chino', 'apparel', 'Northline', 7200],
  ['ribbed-tank-top', 'Ribbed Cotton Tank Top', 'apparel', 'Northline', 2400],
  ['waterproof-shell-jacket', 'Waterproof Trail Shell', 'apparel', 'Summit & Shore', 15800],
  ['fleece-quarter-zip', 'Recycled Fleece Quarter-Zip', 'apparel', 'Summit & Shore', 9400],
  ['relaxed-fit-hoodie', 'Relaxed Fit Pullover Hoodie', 'apparel', 'Fieldwork', 6800],
  ['everyday-ankle-socks', 'Everyday Merino Ankle Socks', 'apparel', 'Northline', 1800],
  ['canvas-low-top-sneakers', 'Canvas Low-Top Sneakers', 'footwear', 'Common Ground', 5900],
  ['leather-court-sneakers', 'Leather Court Sneakers', 'footwear', 'Common Ground', 11200],
  ['trail-running-shoes', 'All-Terrain Running Shoes', 'footwear', 'Summit & Shore', 12900],
  ['suede-desert-boots', 'Suede Desert Boots', 'footwear', 'Common Ground', 14500],
  ['everyday-leather-loafers', 'Everyday Leather Loafers', 'footwear', 'Common Ground', 13800],
  ['waterproof-hiking-boots', 'Waterproof Hiking Boots', 'footwear', 'Summit & Shore', 17600],
  ['minimal-slide-sandals', 'Minimal Leather Slide Sandals', 'footwear', 'Common Ground', 6200],
  ['knit-running-sneakers', 'Lightweight Knit Runners', 'footwear', 'Summit & Shore', 11800],
  ['packable-rain-boots', 'Packable Rain Boots', 'footwear', 'Summit & Shore', 8500],
  ['wool-house-slippers', 'Wool House Slippers', 'footwear', 'Common Ground', 5400],
  ['stainless-steel-watch', 'Stainless Steel Field Watch', 'accessories', 'Meridian Works', 18900],
  ['leather-card-holder', 'Slim Leather Card Holder', 'accessories', 'Meridian Works', 4200],
  ['everyday-canvas-tote', 'Everyday Canvas Tote', 'accessories', 'Fieldwork', 3200],
  ['polarized-sunglasses', 'Polarized Wayfarer Sunglasses', 'accessories', 'Meridian Works', 7800],
  ['woven-leather-belt', 'Woven Leather Belt', 'accessories', 'Meridian Works', 5600],
  ['commuter-backpack', 'Weatherproof Commuter Backpack', 'accessories', 'Summit & Shore', 12400],
  ['reversible-wool-scarf', 'Reversible Wool Scarf', 'accessories', 'Northline', 6800],
  ['recycled-knit-beanie', 'Recycled Knit Beanie', 'accessories', 'Northline', 2800],
  ['travel-organizer-set', 'Travel Organizer Set', 'accessories', 'Fieldwork', 4600],
  ['compact-umbrella', 'Windproof Compact Umbrella', 'accessories', 'Summit & Shore', 3900],
  ['ceramic-coffee-mug', 'Hand-Finished Ceramic Mug', 'home-living', 'Sunday House', 2600],
  ['linen-duvet-cover', 'Washed Linen Duvet Cover', 'home-living', 'Sunday House', 18900],
  ['wooden-serving-board', 'Solid Oak Serving Board', 'home-living', 'Sunday House', 7400],
  ['cotton-bath-towel-set', 'Organic Cotton Bath Towel Set', 'home-living', 'Sunday House', 8200],
  ['glass-table-lamp', 'Opal Glass Table Lamp', 'home-living', 'Sunday House', 13600],
  ['woven-storage-basket', 'Handwoven Storage Basket', 'home-living', 'Sunday House', 5100],
  ['pour-over-coffee-kit', 'Pour-Over Coffee Starter Kit', 'home-living', 'Sunday House', 6900],
  ['essential-oil-diffuser', 'Ceramic Essential Oil Diffuser', 'home-living', 'Sunday House', 8900],
  ['wireless-headphones', 'Studio Wireless Headphones', 'electronics', 'Signal Audio', 16900],
  ['portable-bluetooth-speaker', 'Portable Bluetooth Speaker', 'electronics', 'Signal Audio', 8900],
  ['mechanical-keyboard', 'Compact Mechanical Keyboard', 'electronics', 'Signal Audio', 12400],
  ['usb-c-charging-hub', 'Six-Port USB-C Charging Hub', 'electronics', 'Signal Audio', 5400],
  ['portable-power-bank', '20,000 mAh Travel Power Bank', 'electronics', 'Signal Audio', 6200],
  ['daily-face-moisturizer', 'Daily Barrier Face Moisturizer', 'beauty-care', 'Kindred Botanics', 3400],
  ['botanical-hand-cream', 'Botanical Hand Cream Set', 'beauty-care', 'Kindred Botanics', 2800],
  ['mineral-sunscreen-spf50', 'Mineral Sunscreen SPF 50', 'beauty-care', 'Kindred Botanics', 2500],
  ['reusable-water-bottle', 'Insulated Stainless Water Bottle', 'outdoors', 'Summit & Shore', 4200],
  ['compact-camping-lantern', 'Rechargeable Camping Lantern', 'outdoors', 'Summit & Shore', 5700],
  ['trail-daypack', 'Lightweight Trail Daypack', 'outdoors', 'Summit & Shore', 9800],
  ['hardcover-field-notebook', 'Hardcover Field Notebook Set', 'books-stationery', 'Paper & Pine', 2200],
] as const;

const imageByCategory: Record<string, string> = {
  apparel: 'photo-1521572163474-6864f9cf17ab',
  footwear: 'photo-1542291026-7eec264c27ff',
  accessories: 'photo-1523275335684-37898b6baf30',
  'home-living': 'photo-1616486338812-3dadae4b4ace',
  electronics: 'photo-1505740420928-5e560c06d30e',
  'beauty-care': 'photo-1596462502278-27bfdc403348',
  outdoors: 'photo-1500530855697-b586d89ba3ee',
  'books-stationery': 'photo-1544947950-fa07a98d237f',
};

function requiredPassword(name: string) {
  const password = requiredEnvironment(name);
  if (password.length < 12) {
    throw new Error(`${name} must be at least 12 characters long`);
  }
  return password;
}

async function main() {
  const adminEmail = requiredEnvironment('SEED_ADMIN_EMAIL').toLowerCase();
  const adminPassword = requiredPassword('SEED_ADMIN_PASSWORD');
  const customerEmail = requiredEnvironment('SEED_CUSTOMER_EMAIL').toLowerCase();
  const customerPassword = requiredPassword('SEED_CUSTOMER_PASSWORD');
  const passwordHashes = await Promise.all([
    bcrypt.hash(adminPassword, 12),
    bcrypt.hash(customerPassword, 12),
  ]);

  const categoryBySlug = new Map<string, string>();
  for (const category of categories) {
    const saved = await prisma.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: { name: category.name },
    });
    categoryBySlug.set(category.slug, saved.id);
  }

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      passwordHash: passwordHashes[0],
      firstName: 'Store',
      lastName: 'Administrator',
      role: UserRole.ADMIN,
      emailVerifiedAt: new Date(),
    },
    update: { role: UserRole.ADMIN, deletedAt: null },
  });
  const customer = await prisma.user.upsert({
    where: { email: customerEmail },
    create: {
      email: customerEmail,
      passwordHash: passwordHashes[1],
      firstName: 'Alex',
      lastName: 'Morgan',
      emailVerifiedAt: new Date(),
    },
    update: { deletedAt: null },
  });

  for (const [index, [slug, name, categorySlug, brand, priceAmount]] of products.entries()) {
    const categoryId = categoryBySlug.get(categorySlug);
    if (!categoryId) {
      throw new Error(`Seed product "${slug}" references unknown category "${categorySlug}"`);
    }

    const product = await prisma.product.upsert({
      where: { slug },
      create: {
        slug,
        name,
        description: `${name}, thoughtfully designed for everyday use. Made with carefully selected materials and backed by our quality guarantee.`,
        brand,
        status: ProductStatus.ACTIVE,
        categoryId,
      },
      update: {
        name,
        description: `${name}, thoughtfully designed for everyday use. Made with carefully selected materials and backed by our quality guarantee.`,
        brand,
        status: ProductStatus.ACTIVE,
        categoryId,
        deletedAt: null,
      },
    });
    const sku = `COM-${slug.toUpperCase()}`;
    const variant = await prisma.productVariant.upsert({
      where: { sku },
      create: {
        productId: product.id,
        sku,
        name: 'Standard',
        priceAmount,
        optionValues: { size: 'One size', color: 'Natural' },
      },
      update: {
        name: 'Standard',
        priceAmount,
        optionValues: { size: 'One size', color: 'Natural' },
        deletedAt: null,
      },
    });

    await prisma.inventory.upsert({
      where: { variantId: variant.id },
      create: { variantId: variant.id, quantity: 18 + (index % 17) },
      update: {},
    });
    await prisma.productImage.upsert({
      where: { productId_sortOrder: { productId: product.id, sortOrder: 0 } },
      create: {
        productId: product.id,
        url: `https://images.unsplash.com/${imageByCategory[categorySlug]}?auto=format&fit=crop&w=1000&q=85`,
        altText: name,
        sortOrder: 0,
      },
      update: {
        url: `https://images.unsplash.com/${imageByCategory[categorySlug]}?auto=format&fit=crop&w=1000&q=85`,
        altText: name,
      },
    });
  }

  const sampleProduct = await prisma.product.findUniqueOrThrow({
    where: { slug: 'organic-cotton-crew-tee' },
    include: { variants: true },
  });
  const sampleVariant = sampleProduct.variants[0];
  const sampleOrderNumber = 'SEED-2026-0001';
  await prisma.order.upsert({
    where: { orderNumber: sampleOrderNumber },
    create: {
      orderNumber: sampleOrderNumber,
      userId: customer.id,
      status: OrderStatus.DELIVERED,
      currency: 'USD',
      subtotalAmount: sampleVariant.priceAmount,
      shippingAmount: 0,
      taxAmount: 0,
      discountAmount: 0,
      totalAmount: sampleVariant.priceAmount,
      shippingAddress: {
        fullName: 'Alex Morgan',
        line1: '120 Market Street',
        city: 'Portland',
        region: 'Oregon',
        postalCode: '97205',
        countryCode: 'US',
      },
      items: {
        create: {
          productId: sampleProduct.id,
          variantId: sampleVariant.id,
          sku: sampleVariant.sku,
          productName: sampleProduct.name,
          variantName: sampleVariant.name,
          unitPriceAmount: sampleVariant.priceAmount,
          quantity: 1,
          lineTotalAmount: sampleVariant.priceAmount,
        },
      },
    },
    update: {},
  });

  await prisma.wishlist.upsert({
    where: { userId: customer.id },
    create: { userId: customer.id },
    update: {},
  });

  console.info(
    `Seed complete: ${categories.length} categories, ${products.length} products, admin ${admin.email}, customer ${customer.email}.`,
  );
}

void main()
  .catch((error: unknown) => {
    console.error('Database seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
