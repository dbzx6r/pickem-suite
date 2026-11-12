import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      mustChangePassword: boolean;
      sessionVersion: number;
    };
  }

  interface User {
    id: string;
    role: string;
    mustChangePassword: boolean;
    sessionVersion: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: string;
    mustChangePassword: boolean;
    sessionVersion: number;
  }
}
