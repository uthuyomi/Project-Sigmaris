import { Suspense } from "react";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default async function LoginPage(props: {
  searchParams?: Promise<{ next?: string; error?: string; desc?: string }>;
}) {
  const sp = props.searchParams ? await props.searchParams : null;
  const nextPath = typeof sp?.next === "string" ? sp.next : null;
  const error = typeof sp?.error === "string" ? sp.error : null;
  const desc = typeof sp?.desc === "string" ? sp.desc : null;
  return (
    <Suspense fallback={null}>
      <LoginClient nextPath={nextPath} initialError={error} initialErrorDescription={desc} />
    </Suspense>
  );
}
