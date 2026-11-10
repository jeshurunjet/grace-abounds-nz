'use client';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { api } from '../lib/api-client';

/**
 * After a first sign-in from the sign-up form, saves the name the person
 * typed to their new account (email-code and Google sign-in can't carry it).
 */
export function ProfileSync() {
  const { status } = useSession();
  useEffect(() => {
    if (status !== 'authenticated') return;
    const name = sessionStorage.getItem('grace-pending-name');
    if (!name) return;
    void (async () => {
      try {
        const me = await api<{ name: string | null }>('/me');
        if (!me.data.name)
          await api('/me', {
            method: 'PATCH',
            version: me.version,
            body: JSON.stringify({ name }),
          });
        sessionStorage.removeItem('grace-pending-name');
      } catch {
        /* Retried on the next page load. */
      }
    })();
  }, [status]);
  return null;
}
