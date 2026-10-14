import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage() {
  await ensureSeeded();
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="ms-grid-bg flex min-h-dvh items-center justify-center bg-[var(--bg)] py-8">
      <LoginForm />
    </div>
  );
}
