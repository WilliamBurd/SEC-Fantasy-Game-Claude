import { describe, expect, it } from "vitest";

import { formatDay, formatKickoff, formatPpg, formatTimestamp, isTimeTba, lockCountdown } from "./format";

describe("formatKickoff", () => {
  it("shows the day and Eastern time", () => {
    expect(formatKickoff("2026-10-03T19:30:00Z")).toBe("Sat, Oct 3 · 3:30 PM ET");
    expect(formatKickoff("2026-11-28T17:00:00Z")).toBe("Sat, Nov 28 · 12:00 PM ET"); // after clocks change
  });

  it("marks midnight Eastern kickoffs as time TBA", () => {
    expect(isTimeTba("2026-10-10T04:00:00Z")).toBe(true);
    expect(isTimeTba("2026-11-07T05:00:00Z")).toBe(true);
    expect(isTimeTba("2026-10-10T16:00:00Z")).toBe(false);
    expect(formatKickoff("2026-10-10T04:00:00Z")).toBe("Sat, Oct 10 · time TBA");
  });
});

describe("formatDay and formatPpg", () => {
  it("formats", () => {
    expect(formatDay("2026-10-06T12:00:00Z")).toBe("Tuesday, Oct 6");
    expect(formatPpg(12.345)).toBe("12.3");
    expect(formatPpg(null)).toBe("–");
  });
});

describe("lockCountdown", () => {
  const kickoff = "2026-10-03T16:00:00Z";
  it("counts down in the last 24 hours", () => {
    expect(lockCountdown(kickoff, new Date("2026-10-02T15:00:00Z"))).toBeNull();
    expect(lockCountdown(kickoff, new Date("2026-10-02T16:30:00Z"))).toBe("Locks in 23h 30m");
    expect(lockCountdown(kickoff, new Date("2026-10-03T13:55:00Z"))).toBe("Locks in 2h 05m");
    expect(lockCountdown(kickoff, new Date("2026-10-03T15:15:30Z"))).toBe("Locks in 44m");
    expect(lockCountdown(kickoff, new Date("2026-10-03T15:59:30Z"))).toBe("Locks in under a minute");
    expect(lockCountdown(kickoff, new Date("2026-10-03T16:00:00Z"))).toBeNull();
  });
});

describe("formatTimestamp", () => {
  it("shows day and Eastern time", () => {
    expect(formatTimestamp("2026-09-30T16:12:00Z")).toBe("Wed, Sep 30 · 12:12 PM ET");
  });
});
