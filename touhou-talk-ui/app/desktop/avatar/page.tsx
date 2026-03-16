import { Suspense } from "react";
import AvatarClient from "./AvatarClient";

export const dynamic = "force-dynamic";

export default function DesktopAvatarPage() {
  return (
    <div className="h-dvh w-full overflow-hidden">
      <Suspense
        fallback={
          <div className="flex h-dvh w-full items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        }
      >
        <AvatarClient />
      </Suspense>
    </div>
  );
}

