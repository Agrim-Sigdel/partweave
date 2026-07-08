/** Auth contracts shared by web and mobile. Concrete impls live per-platform. */

export interface Credentials {
  email: string;
  password: string;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface AuthUser {
  id: number;
  email: string;
}

/**
 * Where access/refresh tokens are persisted. Web implements this over
 * localStorage/cookies; mobile over expo-secure-store. Consumers depend on this
 * interface, never on a concrete store.
 */
export interface TokenStore {
  get(): Promise<string | null>;
  set(tokens: AuthTokens): Promise<void>;
  clear(): Promise<void>;
}
