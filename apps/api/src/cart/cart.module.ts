import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

@Module({
  imports: [PassportModule],
  controllers: [CartController],
  providers: [CartService, OptionalJwtAuthGuard],
  exports: [CartService],
})
export class CartModule {}
