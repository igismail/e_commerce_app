export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;
export const AUTH_ISSUER = 'commerce-api';
export const AUTH_AUDIENCE = 'commerce-storefront';

export function getAccessTokenSecret() {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('ACCESS_TOKEN_SECRET must contain at least 32 bytes');
  }
  return secret;
}
