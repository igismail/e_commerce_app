import { timingSafeEqual } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';

export function assertCsrfTokens(cookieToken?: string, headerToken?: string) {
  if (!cookieToken || !headerToken) {
    throw new UnauthorizedException('CSRF token is required');
  }

  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);
  if (
    cookieBuffer.length !== headerBuffer.length ||
    !timingSafeEqual(cookieBuffer, headerBuffer)
  ) {
    throw new UnauthorizedException('CSRF token is invalid');
  }
}
