import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
export default function ResetPasswordPage(){return <main className="mx-auto max-w-lg p-8 md:p-16"><h1 className="mb-6 text-3xl font-semibold">Set a new password</h1><Suspense fallback={<p>Loading...</p>}><ResetPasswordForm/></Suspense></main>}
