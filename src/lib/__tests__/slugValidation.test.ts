import { describe, it, expect } from "vitest";
import {
  createSlug,
  validateSlugFormat,
  SLUG_MIN_LENGTH,
  SLUG_MAX_LENGTH,
} from "../utils/slugValidation";

describe("slugValidation", () => {
  describe("createSlug", () => {
    it("converts to lowercase", () => {
      expect(createSlug("Hello World")).toBe("hello-world");
    });

    it("replaces spaces with hyphens", () => {
      expect(createSlug("foo bar baz")).toBe("foo-bar-baz");
    });

    it("replaces special characters with hyphens", () => {
      expect(createSlug("foo@bar#baz")).toBe("foo-bar-baz");
    });

    it("collapses consecutive hyphens", () => {
      expect(createSlug("foo---bar")).toBe("foo-bar");
    });

    it("trims leading and trailing hyphens", () => {
      expect(createSlug("--foo--")).toBe("foo");
    });

    it("handles mixed special chars and spaces", () => {
      expect(createSlug("  My Café! ")).toBe("my-caf");
    });

    it("handles already valid slug", () => {
      expect(createSlug("valid-slug-123")).toBe("valid-slug-123");
    });

    it("handles empty string", () => {
      expect(createSlug("")).toBe("");
    });

    it("handles string with only special chars", () => {
      expect(createSlug("@#$%")).toBe("");
    });
  });

  describe("validateSlugFormat", () => {
    it("returns null for valid slug", () => {
      expect(validateSlugFormat("my-slug-123")).toBeNull();
    });

    it("returns error for too short slug", () => {
      expect(validateSlugFormat("ab")).not.toBeNull();
      expect(validateSlugFormat("ab")).toContain(String(SLUG_MIN_LENGTH));
    });

    it("returns error for too long slug", () => {
      const longSlug = "a".repeat(SLUG_MAX_LENGTH + 1);
      expect(validateSlugFormat(longSlug)).not.toBeNull();
    });

    it("accepts slug at minimum length", () => {
      expect(validateSlugFormat("abc")).toBeNull();
    });

    it("accepts slug at maximum length", () => {
      expect(validateSlugFormat("a".repeat(SLUG_MAX_LENGTH))).toBeNull();
    });

    it("returns error for uppercase characters", () => {
      expect(validateSlugFormat("Hello")).not.toBeNull();
    });

    it("returns error for special characters", () => {
      expect(validateSlugFormat("foo_bar")).not.toBeNull();
    });

    it("returns error for consecutive hyphens", () => {
      expect(validateSlugFormat("foo--bar")).not.toBeNull();
    });

    it("returns error for leading hyphen", () => {
      expect(validateSlugFormat("-foo")).not.toBeNull();
    });

    it("returns error for trailing hyphen", () => {
      expect(validateSlugFormat("foo-")).not.toBeNull();
    });

    it("accepts digits at start and end", () => {
      expect(validateSlugFormat("123-abc-456")).toBeNull();
    });

    it("accepts all-digit slug", () => {
      expect(validateSlugFormat("123")).toBeNull();
    });

    it("accepts all-letter slug", () => {
      expect(validateSlugFormat("abc")).toBeNull();
    });
  });

  describe("constants", () => {
    it("SLUG_MIN_LENGTH is 3", () => {
      expect(SLUG_MIN_LENGTH).toBe(3);
    });

    it("SLUG_MAX_LENGTH is 50", () => {
      expect(SLUG_MAX_LENGTH).toBe(50);
    });
  });
});
