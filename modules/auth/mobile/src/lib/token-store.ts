import * as SecureStore from "expo-secure-store";
import type { AuthTokens, TokenStore } from "@app/shared";

const ACCESS = "access_token";
const REFRESH = "refresh_token";

/** Mobile TokenStore over the device secure enclave (same interface as web). */
export const tokenStore: TokenStore = {
  async get() {
    return SecureStore.getItemAsync(ACCESS);
  },
  async getRefresh() {
    return SecureStore.getItemAsync(REFRESH);
  },
  async set(tokens: AuthTokens) {
    await SecureStore.setItemAsync(ACCESS, tokens.access);
    await SecureStore.setItemAsync(REFRESH, tokens.refresh);
  },
  async setAccess(access: string) {
    await SecureStore.setItemAsync(ACCESS, access);
  },
  async clear() {
    await SecureStore.deleteItemAsync(ACCESS);
    await SecureStore.deleteItemAsync(REFRESH);
  },
};
