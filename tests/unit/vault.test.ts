import { describe, expect, test } from "bun:test";
import {
  type CredentialApi,
  createSecretVault,
  redactSensitiveText,
  toRendererVaultStatus,
} from "../../apps/studio/bunium/services/vault";

function memoryCredentialApi(): CredentialApi {
  const entries = new Map<string, string>();
  const key = (service: string, name: string) => `${service}\u0000${name}`;
  return {
    async get({ service, name }) {
      return entries.get(key(service, name)) ?? null;
    },
    async set({ service, name, value }) {
      entries.set(key(service, name), value);
    },
    async delete({ service, name }) {
      return entries.delete(key(service, name));
    },
  };
}

describe("host credential vault", () => {
  test("stores and retrieves opaque references through the system backend", async () => {
    const vault = await createSecretVault({
      platform: "darwin",
      api: memoryCredentialApi(),
    });
    expect(vault.status).toEqual({ mode: "system", backend: "macos-keychain" });
    const secret = "private-token-value";
    const reference = await vault.set(secret);
    expect(reference).toMatch(/^vault:v1:[0-9a-f-]{36}$/u);
    expect(await vault.get(reference)).toBe(secret);
    expect(JSON.stringify(toRendererVaultStatus(vault.status))).not.toContain(
      secret,
    );
    expect(await vault.delete(reference)).toBe(true);
    expect(await vault.get(reference)).toBeNull();
  });

  test("selects visibly session-only storage when native secret storage is unavailable", async () => {
    const unavailable: CredentialApi = {
      async get() {
        throw new Error("raw OS error must not leak");
      },
      async set() {
        throw new Error("raw OS error must not leak");
      },
      async delete() {
        throw new Error("raw OS error must not leak");
      },
    };
    const vault = await createSecretVault({
      platform: "linux",
      api: unavailable,
    });
    expect(vault.status).toEqual({
      mode: "session-only",
      backend: "memory",
      fallbackReason: "system-store-unavailable",
    });
    const reference = await vault.set("session-secret");
    expect(await vault.get(reference)).toBe("session-secret");
    vault.close();
    expect(await vault.get(reference)).toBeNull();
    expect(JSON.stringify(toRendererVaultStatus(vault.status))).not.toContain(
      "session-secret",
    );
  });

  test("uses session-only mode when the runtime API or platform is unsupported", async () => {
    expect(
      (await createSecretVault({ platform: "win32", api: null })).status
        .fallbackReason,
    ).toBe("native-api-unavailable");
    expect(
      (
        await createSecretVault({
          platform: "freebsd",
          api: memoryCredentialApi(),
        })
      ).status.fallbackReason,
    ).toBe("unsupported-platform");
  });

  test("redacts known credentials, Telegram tokens, init data and phone identifiers", () => {
    const known = "exact-secret-xyz";
    const output = redactSensitiveText(
      `token=${known} bot=12345:abcdefghijklmnopqrstuvwxyz_123 initData=abcdef phone=+1 (555) 123-4567`,
      [known],
    );
    expect(output).not.toContain(known);
    expect(output).not.toContain("abcdefghijklmnopqrstuvwxyz_123");
    expect(output).not.toContain("abcdef");
    expect(output).not.toContain("555");
  });
});
