import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
} from '@nestjs/swagger';
import { AddressType } from '../generated/prisma/client';
import { PaginationQueryDto } from '../catalog/catalog.dto';

export class AddWishlistItemDto {
  @ApiProperty({ description: 'Active product variant identifier.' })
  @IsString()
  @Length(1, 64)
  variantId!: string;
}

export enum WishlistSort {
  NEWEST = 'newest',
  OLDEST = 'oldest',
}

export class WishlistQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: WishlistSort, default: WishlistSort.NEWEST })
  @IsOptional()
  @IsEnum(WishlistSort)
  sort?: WishlistSort;
}

export class WishlistPaginationResponseDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export class WishlistProductImageResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty()
  altText!: string;

  @ApiProperty()
  sortOrder!: number;
}

export class WishlistProductCategoryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;
}

export class WishlistProductResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ type: String, nullable: true })
  brand!: string | null;

  @ApiProperty({ type: WishlistProductCategoryResponseDto })
  category!: WishlistProductCategoryResponseDto;

  @ApiProperty({ type: [WishlistProductImageResponseDto] })
  images!: WishlistProductImageResponseDto[];
}

export class WishlistItemResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty()
  variantId!: string;

  @ApiProperty()
  variantName!: string;

  @ApiProperty()
  sku!: string;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  optionValues!: Record<string, string>;

  @ApiProperty()
  priceAmount!: number;

  @ApiProperty()
  inStock!: boolean;

  @ApiProperty({ type: WishlistProductResponseDto })
  product!: WishlistProductResponseDto;
}

export class WishlistResponseDto {
  @ApiProperty({ type: [WishlistItemResponseDto] })
  data!: WishlistItemResponseDto[];

  @ApiProperty({ type: WishlistPaginationResponseDto })
  pagination!: WishlistPaginationResponseDto;
}

export class UpdateProfileDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(1, 80)
  firstName?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(1, 80)
  lastName?: string;
}

export class CreateAddressDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 120)
  fullName!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 160)
  line1!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(160)
  line2?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  city!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  region!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 20)
  postalCode!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string;

  @IsEnum(AddressType)
  type!: AddressType;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
