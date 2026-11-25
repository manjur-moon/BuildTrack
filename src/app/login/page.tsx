import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
export default function LoginPage() {
  return <main className="mx-auto max-w-lg p-8 md:p-16"><p className="text-sm">BuildTrack · Authentication</p><h1 className="my-7 text-3xl font-semibold">Sign in</h1><Suspense fallback={<p>Loading...</p>}><LoginForm/></Suspense></main>;
}
