import type { DefaultSession, DefaultUser } from "next-auth";
import type { JWT as DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      login?: string;
      isAdmin?: boolean;
      photoUrl?: string | null;
      department?: string;
      position?: string;
      twoFactorEnabled?: boolean;
      authAt?: number;
      impersonatedBy?: string;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    login?: string;
    isAdmin?: boolean;
    photoUrl?: string | null;
    department?: string;
    position?: string;
    twoFactorEnabled?: boolean;
    impersonatedBy?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string;
    login?: string;
    isAdmin?: boolean;
    photoUrl?: string | null;
    department?: string;
    position?: string;
    twoFactorEnabled?: boolean;
    authAt?: number;
    impersonatedBy?: string;
  }
}
