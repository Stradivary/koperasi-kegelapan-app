// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { formatTime, formatDuration } from "../formatters";

describe("formatTime", () => {
  it("formats unix seconds to HH:MM time string", () => {
    // Use a fixed timestamp: 2024-01-15 08:30:00 UTC
    const ts = new Date("2024-01-15T08:30:00").getTime() / 1000;
    const result = formatTime(ts);
    // Should contain hours and minutes
    expect(result).toMatch(/\d{2}[.:]\d{2}/);
  });

  it("returns a string", () => {
    expect(typeof formatTime(0)).toBe("string");
  });

  it("handles zero timestamp", () => {
    const result = formatTime(0);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("formatDuration", () => {
  it("formats 0 seconds as 00:00:00", () => {
    expect(formatDuration(0)).toBe("00:00:00");
  });

  it("formats 59 seconds as 00:00:59", () => {
    expect(formatDuration(59)).toBe("00:00:59");
  });

  it("formats 60 seconds as 00:01:00", () => {
    expect(formatDuration(60)).toBe("00:01:00");
  });

  it("formats 3600 seconds as 01:00:00", () => {
    expect(formatDuration(3600)).toBe("01:00:00");
  });

  it("formats 3661 seconds as 01:01:01", () => {
    expect(formatDuration(3661)).toBe("01:01:01");
  });

  it("formats 7384 seconds as 02:03:04", () => {
    expect(formatDuration(7384)).toBe("02:03:04");
  });

  it("pads single-digit values with leading zeros", () => {
    expect(formatDuration(65)).toBe("00:01:05");
  });

  it("handles large durations", () => {
    expect(formatDuration(36000)).toBe("10:00:00");
  });
});
