// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createElement } from "react";

// Stub Skeleton to a simple div so we can count rendered elements
vi.mock("#/presentation/components/ui/skeleton.tsx", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

import { DataTableSkeleton } from "../DataTableSkeleton";

afterEach(() => {
  cleanup();
});

describe("DataTableSkeleton", () => {
  describe("desktop mode (isMobile=false)", () => {
    it("renders a header row and data rows", () => {
      render(createElement(DataTableSkeleton, { columns: 3, rows: 4, isMobile: false }));
      // Header has 3 skeletons, each of 4 rows has 3 skeletons = 3 + 12 = 15
      const skeletons = screen.getAllByTestId("skeleton");
      expect(skeletons.length).toBe(3 + 4 * 3);
    });

    it("uses default values (4 columns, 5 rows)", () => {
      render(createElement(DataTableSkeleton, {}));
      const skeletons = screen.getAllByTestId("skeleton");
      // 4 header + 5*4 row = 24
      expect(skeletons.length).toBe(4 + 5 * 4);
    });

    it("renders correct number of columns in header", () => {
      render(createElement(DataTableSkeleton, { columns: 2, rows: 1, isMobile: false }));
      const skeletons = screen.getAllByTestId("skeleton");
      // 2 header + 1*2 row = 4
      expect(skeletons.length).toBe(4);
    });

    it("renders correct number of rows", () => {
      render(createElement(DataTableSkeleton, { columns: 1, rows: 3, isMobile: false }));
      const skeletons = screen.getAllByTestId("skeleton");
      // 1 header + 3*1 = 4
      expect(skeletons.length).toBe(4);
    });

    it("renders border container", () => {
      const { container } = render(
        createElement(DataTableSkeleton, { columns: 2, rows: 2, isMobile: false }),
      );
      expect(container.querySelector(".rounded-lg.border")).toBeTruthy();
    });
  });

  describe("mobile mode (isMobile=true)", () => {
    it("renders card-style rows", () => {
      render(createElement(DataTableSkeleton, { columns: 3, rows: 3, isMobile: true }));
      // Each mobile row has 3 skeletons (icon + 2 text lines)
      const skeletons = screen.getAllByTestId("skeleton");
      expect(skeletons.length).toBe(3 * 3);
    });

    it("uses default rows (5) in mobile mode", () => {
      render(createElement(DataTableSkeleton, { isMobile: true }));
      const skeletons = screen.getAllByTestId("skeleton");
      // 5 rows * 3 skeletons each = 15
      expect(skeletons.length).toBe(5 * 3);
    });

    it("renders rounded border cards", () => {
      const { container } = render(createElement(DataTableSkeleton, { rows: 2, isMobile: true }));
      const cards = container.querySelectorAll(".rounded-xl.border");
      expect(cards.length).toBe(2);
    });

    it("renders space-y-2 wrapper in mobile mode", () => {
      const { container } = render(createElement(DataTableSkeleton, { rows: 1, isMobile: true }));
      expect(container.querySelector(".space-y-2")).toBeTruthy();
    });
  });

  describe("edge cases", () => {
    it("renders nothing meaningful with 0 rows", () => {
      render(createElement(DataTableSkeleton, { columns: 3, rows: 0, isMobile: false }));
      // Only header skeletons (3)
      const skeletons = screen.getAllByTestId("skeleton");
      expect(skeletons.length).toBe(3);
    });

    it("renders nothing meaningful with 0 columns", () => {
      render(createElement(DataTableSkeleton, { columns: 0, rows: 3, isMobile: false }));
      // No skeletons at all
      expect(screen.queryAllByTestId("skeleton")).toHaveLength(0);
    });
  });
});
