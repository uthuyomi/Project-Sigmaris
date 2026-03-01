export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex h-dvh flex-col overflow-hidden max-lg:fixed max-lg:left-0 max-lg:right-0 max-lg:overscroll-none"
      style={{
        top: "var(--app-vvo, 0px)",
        height: "var(--app-vvh, 100dvh)",
      }}
    >
      {children}
    </div>
  );
}

