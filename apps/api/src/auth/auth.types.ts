import { UserRole } from '../generated/prisma/client';

export interface AuthPrincipal {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}
