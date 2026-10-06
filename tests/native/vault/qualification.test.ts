import { afterAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createSecretVault } from "../../../apps/studio/bunium/services/vault";

const vault = await createSecretVault();
let reference: string | undefined;

afterAll(async () => {
  if (reference) await vault.delete(reference);
  vault.close();
});

test(`native ${vault.status.backend} credential round-trip`, async () => {
  expect(vault.status.mode).toBe("system");
  const secret = `native-vault-qualification:${randomUUID()}`;
  reference = await vault.set(secret);
  expect(await vault.get(reference)).toBe(secret);
  expect(await vault.delete(reference)).toBe(true);
  reference = undefined;
  expect(await vault.get(`vault:v1:${randomUUID()}`)).toBeNull();
});
