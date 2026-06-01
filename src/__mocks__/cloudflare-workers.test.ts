// @vitest-environment node
/**
 * Tests for src/__mocks__/cloudflare-workers.ts
 * Covers: env export shape
 */
import { describe, expect, it } from "vitest";
import { env } from "./cloudflare-workers";

describe("cloudflare-workers mock", () => {
  it("exports env object", () => {
    expect(env).toBeDefined();
    expect(typeof env).toBe("object");
  });

  it("env has a DB property", () => {
    expect("DB" in env).toBe(true);
  });
});
