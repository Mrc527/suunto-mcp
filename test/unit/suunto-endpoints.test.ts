import { describe, expect, it } from "vitest";
import { customEndpoints, DEFAULT_ENDPOINTS, endpointEnv, endpointsFromEnv, isLoopbackHost } from "../../src/suunto/endpoints.js";
import { ConfigError } from "../../src/util/errors.js";

describe("Suunto endpoints", () => {
  it("uses the production hosts without overrides", () => {
    expect(DEFAULT_ENDPOINTS).toEqual({ oauthUrl: "https://cloudapi-oauth.suunto.com", apiUrl: "https://cloudapi.suunto.com" });
    expect(endpointsFromEnv({})).toEqual(DEFAULT_ENDPOINTS);
    expect(endpointsFromEnv({ SUUNTO_OAUTH_URL: "  ", SUUNTO_API_URL: "" })).toEqual(DEFAULT_ENDPOINTS);
    expect(customEndpoints(DEFAULT_ENDPOINTS)).toEqual([]);
  });

  it("takes https overrides and strips trailing slashes", () => {
    const e = endpointsFromEnv({ SUUNTO_OAUTH_URL: "https://oauth.example.test/base/", SUUNTO_API_URL: "https://api.example.test//" });
    expect(e).toEqual({ oauthUrl: "https://oauth.example.test/base", apiUrl: "https://api.example.test" });
    expect(customEndpoints(e)).toEqual(["SUUNTO_OAUTH_URL", "SUUNTO_API_URL"]);
    expect(customEndpoints({ ...DEFAULT_ENDPOINTS, apiUrl: "https://x.test" })).toEqual(["SUUNTO_API_URL"]);
  });

  it("allows plain http only on a loopback host", () => {
    expect(endpointsFromEnv({ SUUNTO_API_URL: "http://127.0.0.1:8080/cloudapi" }).apiUrl).toBe("http://127.0.0.1:8080/cloudapi");
    expect(endpointsFromEnv({ SUUNTO_OAUTH_URL: "http://localhost:9000" }).oauthUrl).toBe("http://localhost:9000");
    expect(endpointsFromEnv({ SUUNTO_OAUTH_URL: "http://[::1]:9000/" }).oauthUrl).toBe("http://[::1]:9000");
    expect(() => endpointsFromEnv({ SUUNTO_API_URL: "http://api.example.test" })).toThrow(ConfigError);
    expect(() => endpointsFromEnv({ SUUNTO_API_URL: "http://api.example.test" })).toThrow(/SUUNTO_API_URL must use https/);
  });

  it("refuses values that are not usable https URLs", () => {
    expect(() => endpointsFromEnv({ SUUNTO_OAUTH_URL: "not a url" })).toThrow(/SUUNTO_OAUTH_URL is not a valid URL/);
    expect(() => endpointsFromEnv({ SUUNTO_API_URL: "ftp://api.example.test" })).toThrow(/https/);
    expect(() => endpointsFromEnv({ SUUNTO_API_URL: "https://user:pw@api.example.test" })).toThrow(/user name or password/);
    expect(() => endpointsFromEnv({ SUUNTO_API_URL: "https://api.example.test/?x=1" })).toThrow(/query/);
  });

  it("lists the override variables that are set", () => {
    expect(endpointEnv({ SUUNTO_OAUTH_URL: "https://a.test", SUUNTO_API_URL: "", OTHER: "x" })).toEqual({ SUUNTO_OAUTH_URL: "https://a.test" });
    expect(endpointEnv({})).toEqual({});
  });

  it("knows loopback hosts", () => {
    for (const host of ["localhost", "app.localhost", "127.0.0.1", "127.1.2.3", "::1", "[::1]"]) expect(isLoopbackHost(host)).toBe(true);
    for (const host of ["example.com", "128.0.0.1", "localhost.example.com", "10.0.0.1"]) expect(isLoopbackHost(host)).toBe(false);
  });
});
