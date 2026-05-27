// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { CardPayload } from "#/core/payload/types";
import { CardInfoDisplay } from "../CardInfoDisplay";

function makePayload(overrides: Partial<CardPayload["identity"]> = {}): CardPayload {
  return {
    identity: {
      name: "Alice",
      userId: "u-1",
      gender: 0,
      status: 1,
      createdAt: 1000,
      ...overrides,
    },
    wallet: {
      balance: 50000,
      lastBalance: 0,
      counter: 1n,
      lastTimestamp: 1000,
      state: 0,
      flags: 0,
    },
    header: {
      magic: 0,
      version: 1,
      type: 0,
      cardId: new Uint8Array(6),
      tenantBind: new Uint8Array(4),
    },
    session: { startTime: 0, endTime: 0, terminalId: 0 },
    logEntries: [],
    trailer: {
      expiresAt: 9999999999,
      keyVersion: 1,
      rootHash: new Uint8Array(6),
      counterBind: 1,
      hmac: new Uint8Array(8),
      activePtr: 0,
    },
  } as unknown as CardPayload;
}

afterEach(() => {
  cleanup();
});

describe("CardInfoDisplay", () => {
  describe("valid_payload classification", () => {
    it("renders cardholder name", () => {
      render(
        createElement(CardInfoDisplay, {
          classification: "valid_payload",
          payload: makePayload(),
          isCheckedIn: false,
        }),
      );
      expect(screen.getByText("Alice")).toBeDefined();
    });

    it("renders wallet balance formatted as IDR", () => {
      render(
        createElement(CardInfoDisplay, {
          classification: "valid_payload",
          payload: makePayload(),
          isCheckedIn: false,
        }),
      );
      // Balance 50000 formatted as IDR
      expect(screen.getByText(/50\.000|50,000/)).toBeDefined();
    });

    it("renders a status badge for the card", () => {
      render(
        createElement(CardInfoDisplay, {
          classification: "valid_payload",
          payload: makePayload(),
          isCheckedIn: false,
        }),
      );
      // The CardStatusBadge renders a span with status text
      // Status 1 = ACTIVE → "Active" or similar
      const spans = document.querySelectorAll("span");
      expect(spans.length).toBeGreaterThan(0);
    });

    it("shows check-in status when showCheckInStatus is true and checked in", () => {
      render(
        createElement(CardInfoDisplay, {
          classification: "valid_payload",
          payload: makePayload(),
          isCheckedIn: true,
          showCheckInStatus: true,
        }),
      );
      expect(screen.getByText("Sudah Masuk")).toBeDefined();
    });

    it("shows not-checked-in status when showCheckInStatus is true and not checked in", () => {
      render(
        createElement(CardInfoDisplay, {
          classification: "valid_payload",
          payload: makePayload(),
          isCheckedIn: false,
          showCheckInStatus: true,
        }),
      );
      expect(screen.getByText("Belum Masuk")).toBeDefined();
    });

    it("does not show check-in status when showCheckInStatus is false", () => {
      render(
        createElement(CardInfoDisplay, {
          classification: "valid_payload",
          payload: makePayload(),
          isCheckedIn: true,
          showCheckInStatus: false,
        }),
      );
      expect(screen.queryByText("Sudah Masuk")).toBeNull();
    });

    it("uses custom labels for check-in status", () => {
      render(
        createElement(CardInfoDisplay, {
          classification: "valid_payload",
          payload: makePayload(),
          isCheckedIn: true,
          showCheckInStatus: true,
          labels: { checkedIn: "Masuk", notCheckedIn: "Keluar" },
        }),
      );
      expect(screen.getByText("Masuk")).toBeDefined();
    });

    it("has region role with cardholder name as aria-label", () => {
      render(
        createElement(CardInfoDisplay, {
          classification: "valid_payload",
          payload: makePayload(),
          isCheckedIn: false,
        }),
      );
      const region = screen.getByRole("region");
      expect(region.getAttribute("aria-label")).toBe("Alice");
    });
  });

  describe("non-payload classifications", () => {
    it("renders 'Kartu Kosong' for empty classification", () => {
      render(
        createElement(CardInfoDisplay, {
          classification: "empty",
          payload: null,
          isCheckedIn: false,
        }),
      );
      expect(screen.getByText("Kartu Kosong")).toBeDefined();
    });

    it("renders 'Kartu Tidak Dikenal' for foreign classification", () => {
      render(
        createElement(CardInfoDisplay, {
          classification: "foreign",
          payload: null,
          isCheckedIn: false,
        }),
      );
      expect(screen.getByText("Kartu Tidak Dikenal")).toBeDefined();
    });

    it("renders 'Format Kartu Rusak' for invalid_format classification", () => {
      render(
        createElement(CardInfoDisplay, {
          classification: "invalid_format",
          payload: null,
          isCheckedIn: false,
        }),
      );
      expect(screen.getByText("Format Kartu Rusak")).toBeDefined();
    });

    it("renders serial number when provided", () => {
      render(
        createElement(CardInfoDisplay, {
          classification: "empty",
          payload: null,
          isCheckedIn: false,
          serialNumber: "AA:BB:CC:DD",
        }),
      );
      expect(screen.getByText("AA:BB:CC:DD")).toBeDefined();
    });

    it("does not render serial number when not provided", () => {
      render(
        createElement(CardInfoDisplay, {
          classification: "empty",
          payload: null,
          isCheckedIn: false,
        }),
      );
      expect(screen.queryByText("AA:BB:CC:DD")).toBeNull();
    });

    it("uses custom labels for classification", () => {
      render(
        createElement(CardInfoDisplay, {
          classification: "empty",
          payload: null,
          isCheckedIn: false,
          labels: { empty: "Blank Card" },
        }),
      );
      expect(screen.getByText("Blank Card")).toBeDefined();
    });
  });
});
