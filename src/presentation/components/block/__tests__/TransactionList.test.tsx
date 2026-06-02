// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createElement } from "react";

vi.mock("#/core/payload/types", () => ({
  TxType: {
    DEBIT: 0x00,
    CREDIT: 0x01,
    CHECKIN: 0x02,
    CHECKOUT: 0x03,
    ADMIN: 0x04,
  },
}));

import { TransactionList } from "../TransactionList";
import type { LogEntry } from "#/core/payload/types";

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: 1700000000,
    amount: 10000,
    balanceAfter: 40000,
    flags: 0x00, // Debit
    hash: new Uint8Array(6),
    ...overrides,
  } as LogEntry;
}

afterEach(() => {
  cleanup();
});

describe("TransactionList", () => {
  it("renders nothing when entries array is empty", () => {
    const { container } = render(createElement(TransactionList, { entries: [] }));
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when all entries have zero timestamp and zero amount (and not checkin)", () => {
    const entries = [makeEntry({ timestamp: 0, amount: 0, flags: 0x00 })];
    const { container } = render(createElement(TransactionList, { entries }));
    expect(container.firstChild).toBeNull();
  });

  it("renders entries with non-zero timestamp", () => {
    const entries = [makeEntry({ timestamp: 1700000000, amount: 5000 })];
    render(createElement(TransactionList, { entries }));
    expect(screen.getByText(/5\.000|5,000/)).toBeDefined();
  });

  it("renders entries with non-zero amount", () => {
    const entries = [makeEntry({ timestamp: 0, amount: 15000 })];
    render(createElement(TransactionList, { entries }));
    expect(screen.getByText(/15\.000|15,000/)).toBeDefined();
  });

  it("renders CHECKIN entries even with zero timestamp and amount", () => {
    const entries = [makeEntry({ timestamp: 0, amount: 0, flags: 0x02 })]; // CHECKIN
    render(createElement(TransactionList, { entries }));
    expect(screen.getByText("Check-in")).toBeDefined();
  });

  it("renders 'Debit' label for flags 0x00", () => {
    const entries = [makeEntry({ flags: 0x00 })];
    render(createElement(TransactionList, { entries }));
    expect(screen.getByText("Debit")).toBeDefined();
  });

  it("renders 'Credit' label for flags 0x01", () => {
    const entries = [makeEntry({ flags: 0x01 })];
    render(createElement(TransactionList, { entries }));
    expect(screen.getByText("Credit")).toBeDefined();
  });

  it("renders 'Check-in' label for flags 0x02", () => {
    const entries = [makeEntry({ flags: 0x02 })];
    render(createElement(TransactionList, { entries }));
    expect(screen.getByText("Check-in")).toBeDefined();
  });

  it("renders 'Check-out' label for flags 0x03", () => {
    const entries = [makeEntry({ flags: 0x03 })];
    render(createElement(TransactionList, { entries }));
    expect(screen.getByText("Check-out")).toBeDefined();
  });

  it("renders 'Admin' label for flags 0x04", () => {
    const entries = [makeEntry({ flags: 0x04 })];
    render(createElement(TransactionList, { entries }));
    expect(screen.getByText("Admin")).toBeDefined();
  });

  it("renders 'Unknown' for unrecognized flags", () => {
    const entries = [makeEntry({ flags: 0xff })];
    render(createElement(TransactionList, { entries }));
    expect(screen.getByText("Unknown")).toBeDefined();
  });

  it("renders 'Recent Transactions' heading", () => {
    const entries = [makeEntry()];
    render(createElement(TransactionList, { entries }));
    expect(screen.getByText("Recent Transactions")).toBeDefined();
  });

  it("renders multiple entries", () => {
    const entries = [
      makeEntry({ amount: 5000, flags: 0x00 }),
      makeEntry({ amount: 10000, flags: 0x01 }),
    ];
    render(createElement(TransactionList, { entries }));
    expect(screen.getByText("Debit")).toBeDefined();
    expect(screen.getByText("Credit")).toBeDefined();
  });

  it("shows '-' for zero timestamp", () => {
    const entries = [makeEntry({ timestamp: 0, amount: 5000 })];
    render(createElement(TransactionList, { entries }));
    expect(screen.getByText("-")).toBeDefined();
  });
});
