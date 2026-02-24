import { Suspense } from "react";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default function LoginPage(props: { searchParams?: { next?: string } }) {
  const nextPath = props.searchParams?.next ?? null;
  return (
    <Suspense fallback={null}>
      <LoginClient nextPath={nextPath} />
    </Suspense>
  );
}

