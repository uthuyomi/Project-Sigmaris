// app/map/session/layout.tsx

import StatusHeader from "@/components/StatusHeader";

export default function MapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="h-12 shrink-0">
        <StatusHeader />
      </div>

      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

