// @vitest-environment jsdom
/**
 * Tests for src/hooks/SyncEngineContext.tsx
 * Covers: SyncEngineProvider wires PeerSyncCoordinator, useSyncEngineContext returns value
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const mockUseSyncEngine = vi.fn();
const mockRegisterTriggerSync = vi.fn();
const mockSetActiveTenantId = vi.fn();

vi.mock("#/hooks/useSyncEngine", () => ({
  useSyncEngine: (...args: unknown[]) => mockUseSyncEngine(...args),
}));

vi.mock("#/lib/peerSyncCoordinator", () => ({
  registerTriggerSync: (...args: unknown[]) => mockRegisterTriggerSync(...args),
  setActiveTenantId: (...args: unknown[]) => mockSetActiveTenantId(...args),
}));

import { SyncEngineProvider, useSyncEngineContext } from "#/hooks/SyncEngineContext";

const mockSyncEngine = {
  triggerSync: vi.fn(),
  status: "idle",
  notifyMutation: vi.fn(),
};

function ConsumerComponent() {
  const ctx = useSyncEngineContext();
  return <div data-testid="ctx-value">{ctx ? "has-context" : "no-context"}</div>;
}

describe("SyncEngineProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSyncEngine.mockReturnValue(mockSyncEngine);
  });

  it("renders children", () => {
    render(
      <SyncEngineProvider tenantId="t-1">
        <div data-testid="child">child</div>
      </SyncEngineProvider>,
    );
    expect(screen.getByTestId("child")).toBeDefined();
  });

  it("calls useSyncEngine with tenantId and enabled", () => {
    render(
      <SyncEngineProvider tenantId="t-1" enabled={true}>
        <div />
      </SyncEngineProvider>,
    );
    expect(mockUseSyncEngine).toHaveBeenCalledWith("t-1", true);
  });

  it("defaults enabled to true", () => {
    render(
      <SyncEngineProvider tenantId="t-1">
        <div />
      </SyncEngineProvider>,
    );
    expect(mockUseSyncEngine).toHaveBeenCalledWith("t-1", true);
  });

  it("registers triggerSync with PeerSyncCoordinator when enabled", () => {
    render(
      <SyncEngineProvider tenantId="t-1" enabled={true}>
        <div />
      </SyncEngineProvider>,
    );
    expect(mockSetActiveTenantId).toHaveBeenCalledWith("t-1");
    expect(mockRegisterTriggerSync).toHaveBeenCalledWith(mockSyncEngine.triggerSync);
  });

  it("does not register when enabled is false", () => {
    render(
      <SyncEngineProvider tenantId="t-1" enabled={false}>
        <div />
      </SyncEngineProvider>,
    );
    expect(mockSetActiveTenantId).not.toHaveBeenCalledWith("t-1");
    expect(mockRegisterTriggerSync).not.toHaveBeenCalledWith(mockSyncEngine.triggerSync);
  });

  it("provides context value to consumers", () => {
    render(
      <SyncEngineProvider tenantId="t-1">
        <ConsumerComponent />
      </SyncEngineProvider>,
    );
    expect(screen.getByTestId("ctx-value").textContent).toBe("has-context");
  });
});

describe("useSyncEngineContext", () => {
  it("returns null when used outside SyncEngineProvider", () => {
    render(<ConsumerComponent />);
    expect(screen.getByTestId("ctx-value").textContent).toBe("no-context");
  });
});
