"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useActionState, useState } from "react";

import { createLeague, deleteLeague, joinLeague, leaveLeague, renameLeague } from "@/app/(app)/leagues/actions";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LEAGUE_NAME_MAX } from "@/lib/leagues/validation";

export function CreateLeagueForm() {
  const [state, action, pending] = useActionState(createLeague, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage error={state?.error} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="league-name">League name</Label>
        <Input id="league-name" name="name" required maxLength={LEAGUE_NAME_MAX} defaultValue={state?.value} placeholder="Iron Bowl Crew" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating..." : "Create league"}
      </Button>
    </form>
  );
}

export function JoinLeagueForm({ code }: { code?: string }) {
  const [state, action, pending] = useActionState(joinLeague, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage error={state?.error} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-code">Invite code</Label>
        <Input
          id="invite-code"
          name="code"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={9}
          className="font-mono tracking-widest uppercase"
          defaultValue={state?.value ?? code}
          placeholder="K7Q2XM"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Joining..." : "Join league"}
      </Button>
    </form>
  );
}

/** The invite code, with buttons to copy it or share a join link. */
export function InviteShare({ code, leagueName }: { code: string; leagueName: string }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const link = () => `${window.location.origin}/leagues?join=${code}`;

  async function copy(text: string, what: "code" | "link") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard blocked: the code is on screen to copy by hand.
    }
  }

  async function share() {
    const url = link();
    if (navigator.share) {
      try {
        await navigator.share({ title: leagueName, text: `Join my SEC Gridiron 100 league "${leagueName}" with code ${code}`, url });
        return;
      } catch {
        return; // cancelled
      }
    }
    await copy(url, "link");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-md border bg-muted px-3 py-1.5 font-mono text-lg font-semibold tracking-widest">{code}</span>
      <Button type="button" variant="outline" size="sm" onClick={() => copy(code, "code")}>
        {copied === "code" ? <Check /> : <Copy />} {copied === "code" ? "Copied" : "Copy code"}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={share}>
        {copied === "link" ? <Check /> : <Share2 />} {copied === "link" ? "Link copied" : "Share invite link"}
      </Button>
    </div>
  );
}

export function RenameLeagueForm({ leagueId, name }: { leagueId: string; name: string }) {
  const [state, action, pending] = useActionState(renameLeague, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="leagueId" value={leagueId} />
      <Label htmlFor="rename">League name</Label>
      <div className="flex gap-2">
        <Input id="rename" name="name" required maxLength={LEAGUE_NAME_MAX} defaultValue={state?.value ?? name} />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Saving..." : "Rename"}
        </Button>
      </div>
      <FormMessage error={state?.error} message={state?.message} />
    </form>
  );
}

/** Leave (members) or delete (the league's creator), with a second tap to confirm. */
export function LeaveOrDeleteLeague({ leagueId, isAdmin }: { leagueId: string; isAdmin: boolean }) {
  const [state, action, pending] = useActionState(isAdmin ? deleteLeague : leaveLeague, undefined);
  const [confirming, setConfirming] = useState(false);
  const label = isAdmin ? "Delete league" : "Leave league";
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="leagueId" value={leagueId} />
      <FormMessage error={state?.error} />
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">
            {isAdmin ? "Delete this league for everyone? This can't be undone." : "Leave this league? You can rejoin with the code."}
          </span>
          <Button type="submit" variant="destructive" size="sm" disabled={pending}>
            {pending ? "Working..." : `Yes, ${label.toLowerCase()}`}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => setConfirming(true)}>
          {label}
        </Button>
      )}
    </form>
  );
}
