// @vitest-environment jsdom
/**
 * Tests for LoginSection.tsx
 * Targets: lines 64, 83-89, 109-115, 173-174, 184
 * Covers: detecting/setup/server-browse/scout-browse/device-setup/login modes
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mockNavigate }));

const mockFlow = {
  mode: "login" as string,
  setupStep: "auth" as string,
  username: "",
  password: "",
  localTenants: [],
  slugNotFoundError: null as string | null,
  deviceSetupLaunchContext: null as null | { returnLabel?: string; returnTo: string },
  pendingContext: null,
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
  handleScoutEnterSlug: vi.fn(),
  handlePickDeviceRole: vi.fn(),
  advanceToPickRole: vi.fn(),
};

vi.mock("#/presentation/hooks/useLoginFlow", () => ({ useLoginFlow: () => mockFlow }));

const mockAuth = {
  loading: false,
  error: null as string | null,
  handleUnifiedLogin: vi.fn(),
  handleDeviceSetupAuth: vi.fn(),
};
vi.mock("#/presentation/hooks/useLoginAuth", () => ({ useLoginAuth: () => mockAuth }));

vi.mock("#/presentation/hooks/useServerTenantSearch", () => ({
  useServerTenantSearch: () => ({
    query: "",
    setQuery: vi.fn(),
    results: [],
    loading: false,
    error: null,
  }),
}));

vi.mock("#/presentation/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => ({ isOnline: true }),
}));
vi.mock("#/presentation/lib/brand", () => ({
  BRAND: { APP_NAME: "TestApp", BYLINE: "Test Byline" },
}));

vi.mock("#/presentation/components/block/LoadingState", () => ({
  LoadingState: ({ variant }: { variant?: string }) => <div data-testid={`loading-${variant}`} />,
}));

vi.mock("#/presentation/components/block/loginSection/LoginFormPanel", () => ({
  LoginFormPanel: (props: {
    onStartSetup: () => void;
    onStartDeviceSetup: () => void;
    onOpenServerBrowse: () => void;
    onOpenScoutBrowse: () => void;
    onViewRegisteredTenants: () => void;
  }) => (
    <div data-testid="login-form-panel">
      <button onClick={props.onStartSetup}>start-setup</button>
      <button onClick={props.onStartDeviceSetup}>start-device-setup</button>
      <button onClick={props.onOpenServerBrowse}>open-server-browse</button>
      <button onClick={props.onOpenScoutBrowse}>open-scout-browse</button>
      <button onClick={props.onViewRegisteredTenants}>view-tenants</button>
    </div>
  ),
}));

vi.mock("#/presentation/components/block/loginSection/ServerBrowsePanel", () => ({
  ServerBrowsePanel: (props: {
    onBack: () => void;
    onSelect: (t: { tenantId: string; name: string; slug: string }) => void;
  }) => (
    <div data-testid="server-browse-panel">
      <button onClick={props.onBack}>back</button>
      <button
        onClick={() => props.onSelect({ tenantId: "t1", name: "Koperasi A", slug: "koperasi-a" })}
      >
        select-tenant
      </button>
    </div>
  ),
}));

vi.mock("#/presentation/components/block/loginSection/ScoutBrowsePanel", () => ({
  ScoutBrowsePanel: (props: {
    onBack: () => void;
    onSelectServer: (t: { tenantId: string; name: string; slug: string }) => void;
    onSelectLocal: (t: { tenantId: string; name: string; slug: string }) => void;
    onEnterSlug: (s: string) => void;
  }) => (
    <div data-testid="scout-browse-panel">
      <button onClick={props.onBack}>back</button>
      <button onClick={() => props.onSelectServer({ tenantId: "t1", name: "A", slug: "a" })}>
        select-server
      </button>
      <button onClick={() => props.onSelectLocal({ tenantId: "t2", name: "B", slug: "b" })}>
        select-local
      </button>
      <button onClick={() => props.onEnterSlug("my-slug")}>enter-slug</button>
    </div>
  ),
}));

vi.mock("#/presentation/components/block/loginSection/DeviceSetupAuthPanel", () => ({
  DeviceSetupAuthPanel: (props: { onCancel: () => void }) => (
    <div data-testid="device-setup-auth-panel">
      <button onClick={props.onCancel}>cancel</button>
    </div>
  ),
}));

vi.mock("#/presentation/components/block/loginSection/DeviceRoleSelectionPanel", () => ({
  DeviceRoleSelectionPanel: (props: { onBack: () => void; onSelectRole: (r: string) => void }) => (
    <div data-testid="device-role-panel">
      <button onClick={props.onBack}>back</button>
      <button onClick={() => props.onSelectRole("gate")}>select-gate</button>
    </div>
  ),
}));

vi.mock("#/presentation/components/section/LocalSetupSection", () => ({
  LocalSetupSection: (props: {
    onBack: () => void;
    onComplete: (id: string, role: string) => void;
  }) => (
    <div data-testid="local-setup-section">
      <button onClick={props.onBack}>back</button>
      <button onClick={() => props.onComplete("t1", "admin")}>complete</button>
    </div>
  ),
}));

import { LoginSection } from "../LoginSection";

beforeEach(() => {
  vi.clearAllMocks();
  mockFlow.mode = "login";
  mockFlow.setupStep = "auth";
  mockFlow.deviceSetupLaunchContext = null;
});

afterEach(() => {
  cleanup();
});

describe("LoginSection - mode rendering", () => {
  it("shows loading state when mode=detecting", () => {
    mockFlow.mode = "detecting";
    render(<LoginSection />);
    expect(screen.getByTestId("loading-page")).toBeDefined();
  });

  it("shows LoginFormPanel when mode=login", () => {
    mockFlow.mode = "login";
    render(<LoginSection />);
    expect(screen.getByTestId("login-form-panel")).toBeDefined();
  });

  it("shows LocalSetupSection when mode=setup", () => {
    mockFlow.mode = "setup";
    render(<LoginSection />);
    expect(screen.getByTestId("local-setup-section")).toBeDefined();
  });

  it("shows ServerBrowsePanel when mode=server-browse", () => {
    mockFlow.mode = "server-browse";
    render(<LoginSection />);
    expect(screen.getByTestId("server-browse-panel")).toBeDefined();
  });

  it("shows ScoutBrowsePanel when mode=scout-browse", () => {
    mockFlow.mode = "scout-browse";
    render(<LoginSection />);
    expect(screen.getByTestId("scout-browse-panel")).toBeDefined();
  });

  it("shows DeviceSetupAuthPanel when mode=device-setup and setupStep=auth", () => {
    mockFlow.mode = "device-setup";
    mockFlow.setupStep = "auth";
    render(<LoginSection />);
    expect(screen.getByTestId("device-setup-auth-panel")).toBeDefined();
  });

  it("shows DeviceRoleSelectionPanel when mode=device-setup and setupStep=pick-role", () => {
    mockFlow.mode = "device-setup";
    mockFlow.setupStep = "pick-role";
    render(<LoginSection />);
    expect(screen.getByTestId("device-role-panel")).toBeDefined();
  });
});

describe("LoginSection - LoginFormPanel callbacks", () => {
  beforeEach(() => {
    mockFlow.mode = "login";
  });

  it("calls enterSetup when start-setup clicked", async () => {
    render(<LoginSection />);
    await userEvent.click(screen.getByText("start-setup"));
    expect(mockFlow.enterSetup).toHaveBeenCalledOnce();
  });

  it("calls enterDeviceSetup when start-device-setup clicked", async () => {
    render(<LoginSection />);
    await userEvent.click(screen.getByText("start-device-setup"));
    expect(mockFlow.enterDeviceSetup).toHaveBeenCalledOnce();
  });

  it("calls enterServerBrowse when open-server-browse clicked", async () => {
    render(<LoginSection />);
    await userEvent.click(screen.getByText("open-server-browse"));
    expect(mockFlow.enterServerBrowse).toHaveBeenCalledOnce();
  });

  it("calls enterScoutBrowse when open-scout-browse clicked", async () => {
    render(<LoginSection />);
    await userEvent.click(screen.getByText("open-scout-browse"));
    expect(mockFlow.enterScoutBrowse).toHaveBeenCalledOnce();
  });

  it("navigates to /devices when view-tenants clicked", async () => {
    render(<LoginSection />);
    await userEvent.click(screen.getByText("view-tenants"));
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/devices" });
  });
});

describe("LoginSection - ServerBrowsePanel callbacks", () => {
  beforeEach(() => {
    mockFlow.mode = "server-browse";
  });

  it("calls enterLogin when back clicked", async () => {
    render(<LoginSection />);
    await userEvent.click(screen.getByText("back"));
    expect(mockFlow.enterLogin).toHaveBeenCalledOnce();
  });

  it("calls enterLogin and sets tenant when select-tenant clicked", async () => {
    render(<LoginSection />);
    await userEvent.click(screen.getByText("select-tenant"));
    expect(mockFlow.enterLogin).toHaveBeenCalledOnce();
    expect(mockFlow.setUsername).toHaveBeenCalledWith("");
    expect(mockFlow.setPassword).toHaveBeenCalledWith("");
  });
});

describe("LoginSection - ScoutBrowsePanel callbacks", () => {
  beforeEach(() => {
    mockFlow.mode = "scout-browse";
  });

  it("calls enterLogin when back clicked", async () => {
    render(<LoginSection />);
    await userEvent.click(screen.getByText("back"));
    expect(mockFlow.enterLogin).toHaveBeenCalledOnce();
  });

  it("calls handleScoutSelectTenant when select-server clicked", async () => {
    render(<LoginSection />);
    await userEvent.click(screen.getByText("select-server"));
    expect(mockFlow.handleScoutSelectTenant).toHaveBeenCalledWith("t1", "a", "A");
  });

  it("calls handleScoutSelectTenant when select-local clicked", async () => {
    render(<LoginSection />);
    await userEvent.click(screen.getByText("select-local"));
    expect(mockFlow.handleScoutSelectTenant).toHaveBeenCalledWith("t2", "b", "B");
  });

  it("calls handleScoutEnterSlug with slug when enter-slug clicked", async () => {
    render(<LoginSection />);
    await userEvent.click(screen.getByText("enter-slug"));
    expect(mockFlow.handleScoutEnterSlug).toHaveBeenCalledWith("my-slug", true);
  });
});

describe("LoginSection - DeviceSetupAuthPanel callbacks", () => {
  beforeEach(() => {
    mockFlow.mode = "device-setup";
    mockFlow.setupStep = "auth";
  });

  it("calls exitDeviceSetup when cancel clicked", async () => {
    render(<LoginSection />);
    await userEvent.click(screen.getByText("cancel"));
    expect(mockFlow.exitDeviceSetup).toHaveBeenCalledOnce();
  });
});

describe("LoginSection - DeviceRoleSelectionPanel callbacks", () => {
  beforeEach(() => {
    mockFlow.mode = "device-setup";
    mockFlow.setupStep = "pick-role";
  });

  it("calls handlePickDeviceRole when select-gate clicked", async () => {
    render(<LoginSection />);
    await userEvent.click(screen.getByText("select-gate"));
    expect(mockFlow.handlePickDeviceRole).toHaveBeenCalledWith("gate");
  });

  it("calls exitDeviceSetup when back clicked and launchContext exists", async () => {
    mockFlow.deviceSetupLaunchContext = { returnTo: "/admin", returnLabel: "Admin" };
    render(<LoginSection />);
    await userEvent.click(screen.getByText("back"));
    expect(mockFlow.exitDeviceSetup).toHaveBeenCalledOnce();
  });

  it("calls enterDeviceSetup when back clicked and no launchContext", async () => {
    mockFlow.deviceSetupLaunchContext = null;
    render(<LoginSection />);
    await userEvent.click(screen.getByText("back"));
    expect(mockFlow.enterDeviceSetup).toHaveBeenCalledOnce();
  });
});

describe("LoginSection - LocalSetupSection callbacks", () => {
  beforeEach(() => {
    mockFlow.mode = "setup";
  });

  it("calls enterLogin when back clicked", async () => {
    render(<LoginSection />);
    await userEvent.click(screen.getByText("back"));
    expect(mockFlow.enterLogin).toHaveBeenCalledOnce();
  });

  it("calls redirectToRole when complete clicked", async () => {
    render(<LoginSection />);
    await userEvent.click(screen.getByText("complete"));
    expect(mockFlow.redirectToRole).toHaveBeenCalledWith("t1", "admin");
  });
});
