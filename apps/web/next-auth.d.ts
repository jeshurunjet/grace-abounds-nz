import type { DefaultSession } from 'next-auth';
import type { AppRole } from './auth';

declare module 'next-auth' {
  interface Session {
    /** Server session record id; also used to mark "this device" in Settings. */
    sessionId: string;
    sessionVersion: number;
    user: DefaultSession['user'] & {
      id: string;
      role: AppRole;
      /** Canonical: the same as the user id. */
      profileId: string;
    };
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    sid?: string;
    sv?: number;
    role?: AppRole;
  }
}
