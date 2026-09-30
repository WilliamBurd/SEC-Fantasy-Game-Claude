"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createProfile } from "./actions";

export function OnboardingForm({ next, suggestion }: { next: string; suggestion: string }) {
  const [state, action, pending] = useActionState(createProfile, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <FormMessage error={state?.error} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          required
          minLength={3}
          maxLength={20}
          pattern="[A-Za-z0-9_]{3,20}"
          autoComplete="username"
          defaultValue={state?.username ?? suggestion}
        />
        <p className="text-xs text-muted-foreground">
          3 to 20 letters, numbers or underscores. Shown on leaderboards and in leagues.
        </p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Continue"}
      </Button>
    </form>
  );
}
