import { Suspense } from "react";
import RequireLoginClient from "./RequireLoginClient";

export const dynamic = "force-dynamic";

export default function RequireLoginPage(props: { searchParams?: { next?: string } }) {
  const nextPath = props.searchParams?.next ?? null;
  return (
    <Suspense fallback={null}>
      <RequireLoginClient nextPath={nextPath} />
    </Suspense>
  );
}

