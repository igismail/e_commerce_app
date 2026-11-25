import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/auth.types';
import {
  CreateAddressDto,
  UpdateAddressDto,
  UpdateProfileDto,
} from './users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('users/me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  getProfile(@CurrentUser() user: AuthPrincipal) {
    return this.users.getProfile(user.id);
  }

  @Patch()
  updateProfile(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: UpdateProfileDto,
  ) {
    return this.users.updateProfile(user, body);
  }

  @Get('addresses')
  listAddresses(@CurrentUser() user: AuthPrincipal) {
    return this.users.listAddresses(user.id);
  }

  @Post('addresses')
  @HttpCode(HttpStatus.CREATED)
  createAddress(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: CreateAddressDto,
  ) {
    return this.users.createAddress(user.id, body);
  }

  @Patch('addresses/:addressId')
  updateAddress(
    @CurrentUser() user: AuthPrincipal,
    @Param('addressId') addressId: string,
    @Body() body: UpdateAddressDto,
  ) {
    return this.users.updateAddress(user.id, addressId, body);
  }

  @Delete('addresses/:addressId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAddress(
    @CurrentUser() user: AuthPrincipal,
    @Param('addressId') addressId: string,
  ) {
    return this.users.deleteAddress(user.id, addressId);
  }
}
