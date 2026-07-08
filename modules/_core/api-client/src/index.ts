import createClient, { type Client } from "openapi-fetch";
import type { paths } from "./schema.js";

export type { paths } from "./schema.js";

/**
 * Create a typed API client bound to a base URL. Every request/response is
 * typed against the server's OpenAPI schema (regenerate with `make gen-api`).
 *
 * A `getToken` hook lets auth components attach a bearer token per request
 * without this package depending on any storage mechanism.
 */
export interface ApiClientOptions {
  baseUrl: string;
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
}

export type ApiClient = Client<paths>;

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const client = createClient<paths>({ baseUrl: opts.baseUrl });
  if (opts.getToken) {
    client.use({
      async onRequest({ request }) {
        const token = await opts.getToken!();
        if (token) request.headers.set("Authorization", `Bearer ${token}`);
        return request;
      },
    });
  }
  return client;
}
