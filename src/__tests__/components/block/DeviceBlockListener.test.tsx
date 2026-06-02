// @vitest-environment jsdom
/**
 * Tests for src/components/block/DeviceBlockListener.tsx
 */
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockUseDeviceBlock = vi.fn();

vi.mock("#/presentation/hooks/useDeviceBlock", () => ({
  useDeviceBlock: () => mockUseDeviceBlock(),
}));

import { DeviceBlockListener } from "#/presentation/components/block/DeviceBlockListener";

describe("DeviceBlockListener", () => {
  it("renders nothing (returns null)", () => {
    const { container } = render(<DeviceBlockListener />);
    expect(container.firstChild).toBeNull();
  });

  it("calls useDeviceBlock on mount", () => {
    render(<DeviceBlockListener />);
    expect(mockUseDeviceBlock).toHaveBeenCalled();
  });
});
