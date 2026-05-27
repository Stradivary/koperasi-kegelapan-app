// @vitest-environment jsdom
/**
 * Tests for src/components/section/LoginSection.tsx
 *
 * Covers:
 * - Renders LoadingState when mode is "detecting"
 * - Renders LocalSetupSection when mode is "setup"
 * - Renders ServerBrowsePanel when mode is "server-browse"
 * - Renders ScoutBrowsePanel when mode is "scout-browse"
 * - Renders DeviceSetupAuthPanel when mode is "device-setup" and setupStep is "auth"
 * - Renders DeviceRoleSelectionPanel when mode is "device-setup" and setupStep is "pick-role"
 * - Renders LoginFormPanel when mode is "login"
 * - Passes correct callbacks to panels
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUseLoginFlow = vi.fn();
const mockUseLoginAuth = vi.fn();
const mockUseServerTenantSearch = vi.fn();
const mockUseOnlineStatus = vi.fn();
const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("#/hooks/useLoginFlow", () => ({
  useLoginFlow: () => mockUseLoginFlow(),
}));

vi.mock("#/hooks/useLoginAuth", () => ({
  useLoginAuth: (...args: unknown[]) => mockUseLoginAuth(...args),
}));

vi.mock("#/hooks/useServerTenantSearch", () => ({
  useServerTenantSearch: () => mockUseServerTenantSearch(),
}));

vi.mock("#/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => mockUseOnlineStatus(),
}));

// ── Stub child panels ─────────────────────────────────────────────────────────

vi.mock("../../block/LoadingState", () => ({
  LoadingState: ({ variant }: { variant?: string }) => (
    <div data-testid="loading-state" data-variant={variant} />
  ),
}));

vi.mock("../LocalSetupSection", () => ({
  LocalSetupSection: ({
    onBack,
  }: {
    onComplete: (tenantId: string, role: string) => void;
    onBack: () => void;
  }) => (
    <div data-testid="local-setup-section">
      <button onClick={onBack}>Back from Setup</button>
    </div>
  ),
}));

vi.mock("../../block/loginSection/ServerBrowsePanel", () => ({
  ServerBrowsePanel: ({ onBack }: { onBack: () => void }) => (
    <div data-testid="server-browse-panel">
      <button onClick={onBack}>Back from Server Browse</button>
    </div>
  ),
}));

vi.mock("../../block/loginSection/ScoutBrowsePanel", () => ({
  ScoutBrowsePanel: ({ onBack }: { onBack: () => void }) => (
    <div data-testid="scout-browse-panel">
      <button onClick={onBack}>Back from Scout Browse</button>
    </div>
  ),
}));

vi.mock("../../block/loginSection/DeviceSetupAuthPanel", () => ({
  DeviceSetupAuthPanel: ({ onCancel }: { onCancel: () => void }) => (
    <div data-testid="device-setup-auth-panel">
      <button onClick={onCancel}>Cancel Device Setup</button>
    </div>
  ),
}));

vi.mock("../../block/loginSection/DeviceRoleSelectionPanel", () => ({
  DeviceRoleSelectionPanel: ({ onBack }: { onBack: () => void }) => (
    <div data-testid="device-role-selection-panel">
      <button onClick={onBack}>Back from Role Selection</button>
    </div>
  ),
}));

vi.mock("../../block/loginSection/LoginFormPanel", () => ({
  LoginFormPanel: ({
    onStartSetup,
    onOpenServerBrowse,
    onStartDeviceSetup,
    onOpenScoutBrowse,
  }: {
    onStartSetup: () => void;
    onOpenServerBrowse: () => void;
    onStartDeviceSetup: () => void;
    onOpenScoutBrowse: () => void;
  }) => (
    <div data-testid="login-form-panel">
      <button onClick={onStartSetup}>Start Setup</button>
      <button onClick={onOpenServerBrowse}>Open Server Browse</button>
      <button onClick={onStartDeviceSetup}>Start Device Setup</button>
      <button onClick={onOpenScoutBrowse}>Open Scout Browse</button>
    </div>
  ),
}));

import { LoginSection } from "../LoginSection";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDefaultFlow(overrides: Record<string, unknown> = {}) {
  return {
    mode: "login",
    setupStep: "auth",
    pendingContext: null,
    deviceSetupLaunchContext: null,
    localTenants: [],
    username: "",
    password: "",
    setUsername: vi.fn(),
    setPassword: vi.fn(),
    redirectToRole: vi.fn(),
    enterDeviceSetup: vi.fn(),
    exitDeviceSetup: vi.fn(),
    enterServerBrowse: vi.fn(),
    enterSetup: vi.fn(),
    enterLogin: vi.fn(),
    enterScoutBrowse: vi.fn(),
    handleScoutSelectTenant: vi.fn(),
    handlePickDeviceRole: vi.fn(),
    advanceToPickRole: vi.fn(),
    ...overrides,
  };
}

function makeDefaultAuth() {
  return {
    loading: false,
    error: null,
    handleUnifiedLogin: vi.fn(),
    handleDeviceSetupAuth: vi.fn(),
  };
}

function makeDefaultSearch() {
  return {
    query: "",
    setQuery: vi.fn(),
    results: [],
    loading: false,
    error: null,
  };
}

function setupMocks(flowOverrides: Record<string, unknown> = {}) {
  mockUseLoginFlow.mockReturnValue(makeDefaultFlow(flowOverrides));
  mockUseLoginAuth.mockReturnValue(makeDefaultAuth());
  mockUseServerTenantSearch.mockReturnValue(makeDefaultSearch());
  mockUseOnlineStatus.mockReturnValue({ isOnline: true });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("LoginSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Mode: detecting ─────────────────────────────────────────────────────────

  it("renders LoadingState with page variant when mode is detecting", () => {
    setupMocks({ mode: "detecting" });
    render(<LoginSection />);
    const el = screen.getByTestId("loading-state");
    expect(el).toBeDefined();
    expect(el.getAttribute("data-variant")).toBe("page");
  });

  // ── Mode: setup ─────────────────────────────────────────────────────────────

  it("renders LocalSetupSection when mode is setup", () => {
    setupMocks({ mode: "setup" });
    render(<LoginSection />);
    expect(screen.getByTestId("local-setup-section")).toBeDefined();
  });

  it("calls enterLogin when LocalSetupSection onBack is triggered", async () => {
    const enterLogin = vi.fn();
    setupMocks({ mode: "setup", enterLogin });
    render(<LoginSection />);
    await userEvent.click(screen.getByText("Back from Setup"));
    expect(enterLogin).toHaveBeenCalled();
  });

  // ── Mode: server-browse ─────────────────────────────────────────────────────

  it("renders ServerBrowsePanel when mode is server-browse", () => {
    setupMocks({ mode: "server-browse" });
    render(<LoginSection />);
    expect(screen.getByTestId("server-browse-panel")).toBeDefined();
  });

  it("calls enterLogin when ServerBrowsePanel onBack is triggered", async () => {
    const enterLogin = vi.fn();
    setupMocks({ mode: "server-browse", enterLogin });
    render(<LoginSection />);
    await userEvent.click(screen.getByText("Back from Server Browse"));
    expect(enterLogin).toHaveBeenCalled();
  });

  // ── Mode: scout-browse ──────────────────────────────────────────────────────

  it("renders ScoutBrowsePanel when mode is scout-browse", () => {
    setupMocks({ mode: "scout-browse" });
    render(<LoginSection />);
    expect(screen.getByTestId("scout-browse-panel")).toBeDefined();
  });

  it("calls enterLogin when ScoutBrowsePanel onBack is triggered", async () => {
    const enterLogin = vi.fn();
    setupMocks({ mode: "scout-browse", enterLogin });
    render(<LoginSection />);
    await userEvent.click(screen.getByText("Back from Scout Browse"));
    expect(enterLogin).toHaveBeenCalled();
  });

  // ── Mode: device-setup / auth step ─────────────────────────────────────────

  it("renders DeviceSetupAuthPanel when mode is device-setup and setupStep is auth", () => {
    setupMocks({ mode: "device-setup", setupStep: "auth" });
    render(<LoginSection />);
    expect(screen.getByTestId("device-setup-auth-panel")).toBeDefined();
  });

  it("calls exitDeviceSetup when DeviceSetupAuthPanel onCancel is triggered", async () => {
    const exitDeviceSetup = vi.fn();
    setupMocks({ mode: "device-setup", setupStep: "auth", exitDeviceSetup });
    render(<LoginSection />);
    await userEvent.click(screen.getByText("Cancel Device Setup"));
    expect(exitDeviceSetup).toHaveBeenCalled();
  });

  // ── Mode: device-setup / pick-role step ────────────────────────────────────

  it("renders DeviceRoleSelectionPanel when mode is device-setup and setupStep is pick-role", () => {
    setupMocks({ mode: "device-setup", setupStep: "pick-role" });
    render(<LoginSection />);
    expect(screen.getByTestId("device-role-selection-panel")).toBeDefined();
  });

  it("calls enterDeviceSetup when DeviceRoleSelectionPanel onBack is triggered (no launch context)", async () => {
    const enterDeviceSetup = vi.fn();
    setupMocks({
      mode: "device-setup",
      setupStep: "pick-role",
      deviceSetupLaunchContext: null,
      enterDeviceSetup,
    });
    render(<LoginSection />);
    await userEvent.click(screen.getByText("Back from Role Selection"));
    expect(enterDeviceSetup).toHaveBeenCalled();
  });

  it("calls exitDeviceSetup when DeviceRoleSelectionPanel onBack is triggered with launch context", async () => {
    const exitDeviceSetup = vi.fn();
    setupMocks({
      mode: "device-setup",
      setupStep: "pick-role",
      deviceSetupLaunchContext: { returnTo: "/admin", returnLabel: "Admin" },
      exitDeviceSetup,
    });
    render(<LoginSection />);
    await userEvent.click(screen.getByText("Back from Role Selection"));
    expect(exitDeviceSetup).toHaveBeenCalled();
  });

  // ── Mode: login (default) ───────────────────────────────────────────────────

  it("renders LoginFormPanel when mode is login", () => {
    setupMocks({ mode: "login" });
    render(<LoginSection />);
    expect(screen.getByTestId("login-form-panel")).toBeDefined();
  });

  it("calls enterSetup when LoginFormPanel onStartSetup is triggered", async () => {
    const enterSetup = vi.fn();
    setupMocks({ mode: "login", enterSetup });
    render(<LoginSection />);
    await userEvent.click(screen.getByText("Start Setup"));
    expect(enterSetup).toHaveBeenCalled();
  });

  it("calls enterServerBrowse when LoginFormPanel onOpenServerBrowse is triggered", async () => {
    const enterServerBrowse = vi.fn();
    setupMocks({ mode: "login", enterServerBrowse });
    render(<LoginSection />);
    await userEvent.click(screen.getByText("Open Server Browse"));
    expect(enterServerBrowse).toHaveBeenCalled();
  });

  it("calls enterDeviceSetup when LoginFormPanel onStartDeviceSetup is triggered", async () => {
    const enterDeviceSetup = vi.fn();
    setupMocks({ mode: "login", enterDeviceSetup });
    render(<LoginSection />);
    await userEvent.click(screen.getByText("Start Device Setup"));
    expect(enterDeviceSetup).toHaveBeenCalled();
  });

  it("calls enterScoutBrowse when LoginFormPanel onOpenScoutBrowse is triggered", async () => {
    const enterScoutBrowse = vi.fn();
    setupMocks({ mode: "login", enterScoutBrowse });
    render(<LoginSection />);
    await userEvent.click(screen.getByText("Open Scout Browse"));
    expect(enterScoutBrowse).toHaveBeenCalled();
  });
});
