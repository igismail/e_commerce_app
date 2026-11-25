import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  CategoryQueryDto,
  ProductQueryDto,
  ProductReviewsQueryDto,
  ProductSlugParamsDto,
} from './catalog.dto';
import { CatalogService } from './catalog.service';

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
}
