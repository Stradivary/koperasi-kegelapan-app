import { createFileRoute, Link } from "@tanstack/react-router";
import { CreditCard, Wifi } from "lucide-react";

export const Route = createFileRoute("/dev/")({
  component: DevIndexPage,
});

interface DevTool {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}

const devTools: DevTool[] = [
  {
    to: "/dev/issuance-test",
    icon: <CreditCard size={24} className="text-muted-foreground" />,
    title: "Issuance Test",
    description: "Read & write NFC card payload, no auth required",
  },
  {
    to: "/dev/nfc-test",
    icon: <Wifi size={24} className="text-muted-foreground" />,
    title: "NFC Raw Test",
    description: "Direct NDEFReader API — scan, write, format without payload",
  },
];

function DevIndexPage() {
  return (
    <div className="min-h-screen bg-white p-6 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Dev Tools</h1>
        <p className="text-sm text-muted-foreground mt-1">Internal tools — LAN/dev use only</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {devTools.map((tool) => (
          <Link
            key={tool.to}
            to={tool.to}
            className="border rounded-xl p-5 hover:bg-muted/50 transition-colors flex flex-col gap-3 no-underline"
          >
            {tool.icon}
            <div>
              <p className="font-semibold text-foreground">{tool.title}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{tool.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
