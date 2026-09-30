"use client";

import { useActionState } from "react";

import { requestPasswordReset } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { FormMessage } from "./form-message";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  if (state?.message) return <FormMessage message={state.message} />;
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage error={state?.error} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending..." : "Send reset link"}
      </Button>
    </form>
  );
}
