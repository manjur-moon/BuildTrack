import { Suspense } from "react";
import { RegisterForm } from "@/components/auth/register-form";
export default function RegisterPage() {
  return <main className="mx-auto max-w-lg p-8 md:p-16"><p className="text-sm">BuildTrack · Invitation onboarding</p><h1 className="my-7 text-3xl font-semibold">Create your account</h1><Suspense fallback={<p>Preparing registration...</p>}><RegisterForm/></Suspense></main>;
}
