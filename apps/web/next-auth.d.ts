import type { DefaultSession } from 'next-auth';
import type { AppRole } from './auth';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      role: AppRole;
      profileId: string;
    };
  }
}
