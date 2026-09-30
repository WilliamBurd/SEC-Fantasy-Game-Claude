"use client";

import { Play } from "lucide-react";
import { useActionState, useState } from "react";

import {
  addPlayer,
  clearSalaryOverride,
  mergePlayer,
  runJobNow,
  saveProjection,
  setSalary,
  updatePlayer,
  type AdminFormState,
} from "@/app/(app)/admin/actions";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { POSITIONS, SALARY_MAX, SALARY_MIN } from "@/lib/admin/forms";
import type { JobInfo } from "@/lib/admin/jobs";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-input/30 px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm";

export type PlayerFormValues = {
  id?: number;
  firstName: string;
  lastName: string;
  team: string;
  position: string;
  classYear: number | null;
  active: boolean;
};

/** Add a player (with an optional CFBD ID and a projection) or edit one. */
export function PlayerForm({ teams, player }: { teams: string[]; player?: PlayerFormValues }) {
  const isNew = !player?.id;
  const [state, action, pending] = useActionState(isNew ? addPlayer : updatePlayer, undefined);
  const saved = player ?? { firstName: "", lastName: "", team: "", position: "", classYear: null, active: true };
  // After an error, show what was typed rather than the saved values.
  const typed = state?.error ? state.values : undefined;
  const v = typed
    ? {
        firstName: typed.firstName ?? "",
        lastName: typed.lastName ?? "",
        team: typed.team ?? "",
        position: typed.position ?? "",
        classYear: typed.classYear ?? "",
        active: typed.active === "on",
      }
    : { ...saved, classYear: saved.classYear ?? "" };
  return (
    // A new key after each error rebuilds the form from what was typed (dropdowns
    // otherwise go back to their first option when React resets the form).
    <form key={state?.at ?? "form"} action={action} className="flex flex-col gap-4">
      {!isNew && <input type="hidden" name="playerId" value={player!.id} />}
      <FormMessage error={state?.error} message={state?.message} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName">
          <Input id="firstName" name="firstName" required maxLength={40} defaultValue={v.firstName} />
        </Field>
        <Field label="Last name" htmlFor="lastName">
          <Input id="lastName" name="lastName" required maxLength={40} defaultValue={v.lastName} />
        </Field>
        <Field label="Team" htmlFor="team">
          <select id="team" name="team" required defaultValue={v.team} className={selectClass}>
            <option value="" disabled>
              Pick a team
            </option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Position" htmlFor="position">
          <select id="position" name="position" required defaultValue={v.position} className={selectClass}>
            <option value="" disabled>
              Pick a position
            </option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Class year (optional)" htmlFor="classYear" hint="1 = freshman">
          <Input id="classYear" name="classYear" inputMode="numeric" pattern="[1-6]?" defaultValue={v.classYear} />
        </Field>
        {isNew && (
          <Field label="CFBD player ID (if known)" htmlFor="cfbdId" hint="Blank: a temporary ID until CFBD lists them">
            <Input id="cfbdId" name="cfbdId" inputMode="numeric" pattern="[0-9]*" defaultValue={typed?.cfbdId} />
          </Field>
        )}
        {isNew && (
          <>
            <Field label="Projected PPG" htmlFor="projectedPpg" hint="Used for pricing until they play">
              <Input id="projectedPpg" name="projectedPpg" required inputMode="decimal" placeholder="e.g. 4.5" defaultValue={typed?.projectedPpg} />
            </Field>
            <Field label="Last season's PPG (optional)" htmlFor="priorSeasonPpg">
              <Input id="priorSeasonPpg" name="priorSeasonPpg" inputMode="decimal" defaultValue={typed?.priorSeasonPpg} />
            </Field>
          </>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={v.active} className="size-4 accent-primary" />
        Active (in the player pool)
      </label>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving..." : isNew ? "Add player" : "Save player"}
      </Button>
    </form>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ProjectionForm({
  playerId,
  projectedPpg,
  priorSeasonPpg,
}: {
  playerId: number;
  projectedPpg: number | null;
  priorSeasonPpg: number | null;
}) {
  const [state, action, pending] = useActionState(saveProjection, undefined);
  const typed = state?.error ? state.values : undefined;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="playerId" value={playerId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Projected PPG" htmlFor="projectedPpg">
          <Input id="projectedPpg" name="projectedPpg" required inputMode="decimal" defaultValue={typed?.projectedPpg ?? projectedPpg ?? ""} />
        </Field>
        <Field label="Last season's PPG" htmlFor="priorSeasonPpg" hint="Blank if none">
          <Input id="priorSeasonPpg" name="priorSeasonPpg" inputMode="decimal" defaultValue={typed?.priorSeasonPpg ?? priorSeasonPpg ?? ""} />
        </Field>
      </div>
      <FormMessage error={state?.error} message={state?.message} />
      <Button type="submit" variant="outline" disabled={pending} className="self-start">
        {pending ? "Saving..." : "Save projection"}
      </Button>
    </form>
  );
}

/** One week's salary: set it (an override), or clear an override. */
export function SalaryForm({ playerId, week, salary, overridden }: { playerId: number; week: number; salary: number | null; overridden: boolean }) {
  const [state, action, pending] = useActionState(setSalary, undefined);
  const [clearState, clear, clearing] = useActionState(clearSalaryOverride, undefined);
  const message: AdminFormState = clearState ?? state;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <form action={action} className="flex items-center gap-2">
          <input type="hidden" name="playerId" value={playerId} />
          <input type="hidden" name="week" value={week} />
          <Input
            name="salary"
            aria-label={`Week ${week} salary`}
            inputMode="numeric"
            required
            min={SALARY_MIN}
            max={SALARY_MAX}
            type="number"
            defaultValue={(state?.error ? state.values?.salary : undefined) ?? salary ?? ""}
            className="h-9 w-20"
          />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "..." : salary === null ? "Add to pool" : "Override"}
          </Button>
        </form>
        {overridden && (
          <form action={clear}>
            <input type="hidden" name="playerId" value={playerId} />
            <input type="hidden" name="week" value={week} />
            <Button type="submit" size="sm" variant="ghost" disabled={clearing}>
              Clear override
            </Button>
          </form>
        )}
      </div>
      <FormMessage error={message?.error} message={message?.message} />
    </div>
  );
}

export function MergeForm({ playerId, suggested }: { playerId: number; suggested: number | null }) {
  const [state, action, pending] = useActionState(mergePlayer, undefined);
  const [confirming, setConfirming] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="playerId" value={playerId} />
      <Field label="Their CFBD player ID" htmlFor="mergeId">
        <Input
          id="mergeId"
          name="cfbdId"
          inputMode="numeric"
          required
          defaultValue={(state?.error ? state.values?.cfbdId : undefined) ?? suggested ?? ""}
          className="max-w-48"
        />
      </Field>
      <FormMessage error={state?.error} />
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Move their upcoming weeks to that player and retire this one?</span>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Merging..." : "Yes, merge"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" className="self-start" onClick={() => setConfirming(true)}>
          Merge into CFBD player
        </Button>
      )}
    </form>
  );
}

export function JobCard({ job, info }: { job: string; info: JobInfo }) {
  const [state, action, pending] = useActionState(runJobNow, undefined);
  const [confirming, setConfirming] = useState(false);
  const needsConfirm = Boolean(info.caution);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl bg-card p-4">
      <input type="hidden" name="job" value={job} />
      <div>
        <h2 className="font-display text-2xl font-bold">{info.label}</h2>
        <p className="text-xs font-semibold text-primary">{info.schedule}</p>
        <p className="mt-1 text-sm text-muted-foreground">{info.description}</p>
        {info.caution && <p className="mt-1 text-sm text-orange-300">{info.caution}</p>}
      </div>
      {info.takesWeek && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${job}-week`}>Week (optional)</Label>
          <Input id={`${job}-week`} name="week" inputMode="numeric" className="max-w-24" />
          {info.weekHint && <p className="text-xs text-muted-foreground">{info.weekHint}</p>}
        </div>
      )}
      {needsConfirm && !confirming ? (
        <Button type="button" variant="outline" className="self-start" onClick={() => setConfirming(true)}>
          <Play /> Run now
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending} className="self-start">
            <Play /> {pending ? "Running..." : needsConfirm ? "Yes, run it" : "Run now"}
          </Button>
          {needsConfirm && (
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </Button>
          )}
        </div>
      )}
      {state?.error && <FormMessage error={state.error} />}
      {state?.result && (
        <details open className="rounded-md bg-background p-3 text-xs">
          <summary className="cursor-pointer font-semibold text-emerald-400">Finished</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all">{state.result}</pre>
        </details>
      )}
    </form>
  );
}
