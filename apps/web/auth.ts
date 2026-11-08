import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

export type AppRole = 'member' | 'pastor' | 'admin';

const demoUsers = {
  'member@example.org': {
    id: 'member-1',
    profileId: 'member-michael-tane',
    name: 'Michael Tane',
    role: 'member' as const,
  },
  'pastor@example.org': {
    id: 'pastor-1',
    profileId: 'pastor-bartolome-sanchez',
    name: 'Pastor Bartolome R. Sanchez',
    role: 'pastor' as const,
  },
  'admin@example.org': {
    id: 'admin-1',
    profileId: 'admin-maria-santos',
    name: 'Maria Santos',
    role: 'admin' as const,
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret:
    process.env.AUTH_SECRET ?? 'development-only-replace-before-production',
  trustHost: true,
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize(credentials) {
        const email = String(credentials.email ?? '').toLowerCase();
        if (credentials.password !== 'grace-demo') return null;
        const user = demoUsers[email as keyof typeof demoUsers];
        return user ? { ...user, email } : null;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user && 'role' in user) token.role = user.role;
      if (user && 'profileId' in user) token.profileId = user.profileId;
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? '';
        session.user.role = (token.role as AppRole) ?? 'member';
        session.user.profileId = String(
          token.profileId ?? 'member-michael-tane',
        );
      }
      return session;
    },
    authorized({ auth: session, request }) {
      const path = request.nextUrl.pathname;
      const role = session?.user?.role;
      if (path.startsWith('/admin'))
        return role === 'admin' || role === 'pastor';
      if (path.startsWith('/pastor')) return role === 'pastor';
      if (
        path.startsWith('/members') ||
        path.startsWith('/profile') ||
        path === '/help'
      )
        return Boolean(role);
      return true;
    },
  },
});
