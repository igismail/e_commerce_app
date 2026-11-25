import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CartModule } from '../cart/cart.module';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_AUDIENCE,
  AUTH_ISSUER,
  getAccessTokenSecret,
} from './auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    CartModule,
    JwtModule.register({
      secret: getAccessTokenSecret(),
      signOptions: {
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        issuer: AUTH_ISSUER,
        audience: AUTH_AUDIENCE,
        algorithm: 'HS256',
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, EmailService, JwtStrategy],
  exports: [AuthService, EmailService],
})
export class AuthModule {}
