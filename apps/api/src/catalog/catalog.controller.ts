import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  CategoryQueryDto,
  ProductQueryDto,
  ProductReviewsQueryDto,
  ProductSlugParamsDto,
} from './catalog.dto';
import { CatalogService } from './catalog.service';

const demoArtwork: Record<string, { label: string; color: string; shape: string }> = {
  apparel: {
    label: 'Apparel',
    color: '#b7c8b0',
    shape:
      '<path d="m402 332 116-62 82 45 82-45 116 62 100 132-100 71-52-64v365H452V471l-52 64-100-71z" fill="#f3efe3" stroke="#30413a" stroke-width="24" stroke-linejoin="round"/><path d="m518 270 82 94 82-94" fill="none" stroke="#30413a" stroke-width="20"/>',
  },
  footwear: {
    label: 'Footwear',
    color: '#d3b39c',
    shape:
      '<path d="M288 635c96-14 145-92 173-220l112 35c42 118 132 183 264 207 72 13 117 52 117 112v38H294c-56 0-84-30-84-75 0-49 28-86 78-97z" fill="#f5eee4" stroke="#3b342e" stroke-width="24" stroke-linejoin="round"/><path d="M364 733h589" stroke="#3b342e" stroke-width="22" stroke-linecap="round"/><path d="m526 474 104 22m-80 30 104 22" stroke="#3b342e" stroke-width="16" stroke-linecap="round"/>',
  },
  accessories: {
    label: 'Accessories',
    color: '#c4b8a5',
    shape:
      '<rect x="474" y="376" width="252" height="352" rx="72" fill="#e7dfce" stroke="#3f4038" stroke-width="24"/><path d="M548 376v-80c0-44 36-80 80-80h0c44 0 80 36 80 80v80m-160 352v80c0 44 36 80 80 80h0c44 0 80-36 80-80v-80" fill="none" stroke="#3f4038" stroke-width="24"/><circle cx="600" cy="552" r="72" fill="#c69a62"/><path d="M600 502v56l39 26" fill="none" stroke="#fff9ed" stroke-width="18" stroke-linecap="round"/>',
  },
  'home-living': {
    label: 'Home & Living',
    color: '#d8c8a9',
    shape:
      '<path d="M404 360h392v195c0 77-63 140-140 140H544c-77 0-140-63-140-140z" fill="#f4ead8" stroke="#55483a" stroke-width="24"/><path d="M404 477H300v72c0 91 73 164 164 164m332-236h104v72c0 91-73 164-164 164M500 697l-42 193m242-193 42 193M422 890h356" fill="none" stroke="#55483a" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  electronics: {
    label: 'Electronics',
    color: '#aebfca',
    shape:
      '<path d="M334 580v-80c0-147 119-266 266-266s266 119 266 266v80" fill="none" stroke="#263b49" stroke-width="54" stroke-linecap="round"/><rect x="278" y="527" width="168" height="282" rx="72" fill="#e6edf0" stroke="#263b49" stroke-width="24"/><rect x="754" y="527" width="168" height="282" rx="72" fill="#e6edf0" stroke="#263b49" stroke-width="24"/>',
  },
  'beauty-care': {
    label: 'Beauty & Care',
    color: '#d7b6b0',
    shape:
      '<path d="M512 300h176v108l90 94v360c0 47-38 85-85 85H507c-47 0-85-38-85-85V502l90-94z" fill="#f5e8e4" stroke="#503c3a" stroke-width="24" stroke-linejoin="round"/><path d="M512 300v-86h176v86m-188 108h200" fill="none" stroke="#503c3a" stroke-width="24" stroke-linecap="round"/><rect x="480" y="560" width="240" height="126" rx="24" fill="#c48b84"/><path d="M522 605h156" stroke="#fff5ef" stroke-width="18" stroke-linecap="round"/>',
  },
  outdoors: {
    label: 'Outdoors',
    color: '#a8b99c',
    shape:
      '<path d="m185 840 260-410 160 235 146-200 264 375z" fill="#e8e5d6" stroke="#33453b" stroke-width="24" stroke-linejoin="round"/><path d="m440 840 168-300 170 300m-170-300v300" fill="#c99261" stroke="#33453b" stroke-width="20" stroke-linejoin="round"/><circle cx="846" cy="340" r="78" fill="#e6bf77"/>',
  },
  'books-stationery': {
    label: 'Books & Stationery',
    color: '#c7b2a1',
    shape:
      '<path d="M292 345c124-47 230-35 308 38v520c-78-73-184-85-308-38zm616 0c-124-47-230-35-308 38v520c78-73 184-85 308-38z" fill="#f0e5d7" stroke="#443c35" stroke-width="24" stroke-linejoin="round"/><path d="M356 442c87-24 154-13 207 23m-207 61c87-24 154-13 207 23m-207 60c87-24 154-13 207 23m281-190c87-24 154-13 207 23m-207 61c87-24 154-13 207 23m-207 60c87-24 154-13 207 23" fill="none" stroke="#9d7662" stroke-width="14" stroke-linecap="round"/>',
  },
};

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  @ApiOkResponse({ description: 'Paginated active product categories.' })
  listCategories(@Query() query: CategoryQueryDto) {
    return this.catalog.listCategories(query);
  }

  @Get('products')
  @ApiOkResponse({ description: 'Paginated, filterable active products.' })
  listProducts(@Query() query: ProductQueryDto) {
    return this.catalog.listProducts(query);
  }

  @Get('products/:slug')
  @ApiOkResponse({ description: 'Active product details and variant stock status.' })
  getProduct(@Param() params: ProductSlugParamsDto) {
    return this.catalog.getProduct(params.slug);
  }

  @Get('products/:slug/reviews')
  @ApiOkResponse({ description: 'Paginated approved reviews for an active product.' })
  listProductReviews(
    @Param() params: ProductSlugParamsDto,
    @Query() query: ProductReviewsQueryDto,
  ) {
    return this.catalog.listProductReviews(params.slug, query);
  }

  @Get('demo-images/:categorySlug.svg')
  @ApiProduces('image/svg+xml')
  @ApiOkResponse({ description: 'Backend-hosted demo product image.' })
  @Header('Cache-Control', 'public, max-age=86400, immutable')
  @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  getDemoImage(@Param('categorySlug') categorySlug: string) {
    const artwork = Object.hasOwn(demoArtwork, categorySlug)
      ? demoArtwork[categorySlug]
      : undefined;
    if (!artwork) {
      throw new NotFoundException('Demo product image not found');
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" role="img" aria-labelledby="title"><title id="title">${artwork.label} product image</title><rect width="1200" height="1200" fill="${artwork.color}"/><circle cx="600" cy="570" r="390" fill="#ffffff" fill-opacity=".24"/>${artwork.shape}<text x="600" y="1070" text-anchor="middle" fill="#28352f" font-family="Arial,sans-serif" font-size="42" letter-spacing="5">${artwork.label.toUpperCase()}</text></svg>`;
  }
}
