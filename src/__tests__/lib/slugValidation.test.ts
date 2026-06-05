/**
 * Tests for src/lib/utils/slugValidation.ts
 * Covers: createSlug, validateSlugFormat, SLUG_MIN_LENGTH, SLUG_MAX_LENGTH
 */
import { describe, expect, it } from "vitest";
import {
  createSlug,
  validateSlugFormat,
  SLUG_MIN_LENGTH,
  SLUG_MAX_LENGTH,
} from "#/core/validation/slugValidation";

describe("constants", () => {
  it("SLUG_MIN_LENGTH is 3", () => expect(SLUG_MIN_LENGTH).toBe(3));
  it("SLUG_MAX_LENGTH is 50", () => expect(SLUG_MAX_LENGTH).toBe(50));
});

describe("createSlug", () => {
  it("lowercases input", () => expect(createSlug("Hello")).toBe("hello"));
  it("replaces spaces with hyphens", () => expect(createSlug("hello world")).toBe("hello-world"));
  it("replaces special chars with hyphens", () =>
    expect(createSlug("hello@world!")).toBe("hello-world"));
  it("collapses consecutive hyphens", () =>
    expect(createSlug("hello   world")).toBe("hello-world"));
  it("trims leading hyphens", () => expect(createSlug("  hello")).toBe("hello"));
  it("trims trailing hyphens", () => expect(createSlug("hello  ")).toBe("hello"));
  it("handles mixed case and symbols", () =>
    expect(createSlug("Koperasi Gelap 2024!")).toBe("koperasi-gelap-2024"));
  it("handles already-valid slug", () => expect(createSlug("my-slug")).toBe("my-slug"));
  it("handles numbers", () => expect(createSlug("tenant123")).toBe("tenant123"));
  it("handles empty string", () => expect(createSlug("")).toBe(""));
  it("handles only special chars", () => expect(createSlug("!!!")).toBe(""));
  it("handles unicode by replacing with hyphens", () => expect(createSlug("café")).toBe("caf"));
});

describe("validateSlugFormat - valid slugs", () => {
  it("accepts minimum length slug", () => expect(validateSlugFormat("abc")).toBeNull());
  it("accepts alphanumeric slug", () => expect(validateSlugFormat("my-tenant-123")).toBeNull());
  it("accepts slug with hyphens in middle", () => expect(validateSlugFormat("a-b-c")).toBeNull());
  it("accepts slug at max length", () => {
    const slug = "a".repeat(50);
    expect(validateSlugFormat(slug)).toBeNull();
  });
  it("accepts slug starting and ending with digit", () =>
    expect(validateSlugFormat("1abc1")).toBeNull());
});

describe("validateSlugFormat - too short", () => {
  it("rejects empty string", () => expect(validateSlugFormat("")).not.toBeNull());
  it("rejects 1-char slug", () => expect(validateSlugFormat("a")).not.toBeNull());
  it("rejects 2-char slug", () => expect(validateSlugFormat("ab")).not.toBeNull());
  it("error message mentions length range", () => {
    const err = validateSlugFormat("ab");
    expect(err).toContain("3");
    expect(err).toContain("50");
  });
});

describe("validateSlugFormat - too long", () => {
  it("rejects slug over 50 chars", () => {
    expect(validateSlugFormat("a".repeat(51))).not.toBeNull();
  });
});

describe("validateSlugFormat - invalid characters", () => {
  it("rejects uppercase letters", () => {
    const err = validateSlugFormat("MySlug");
    expect(err).toContain("huruf kecil");
  });
  it("rejects spaces", () => expect(validateSlugFormat("my slug")).not.toBeNull());
  it("rejects underscores", () => expect(validateSlugFormat("my_slug")).not.toBeNull());
  it("rejects dots", () => expect(validateSlugFormat("my.slug")).not.toBeNull());
});

describe("validateSlugFormat - consecutive hyphens", () => {
  it("rejects double hyphens", () => {
    const err = validateSlugFormat("my--slug");
    expect(err).toContain("berturut-turut");
  });
});

describe("validateSlugFormat - start/end rules", () => {
  it("rejects slug starting with hyphen", () => {
    const err = validateSlugFormat("-myslug");
    expect(err).toContain("diawali");
  });
  it("rejects slug ending with hyphen", () => {
    const err = validateSlugFormat("myslug-");
    expect(err).toContain("diakhiri");
  });
});
