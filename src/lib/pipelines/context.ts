import type { CfbdClient } from "@/lib/cfbd/client";

import type { Db } from "./db";

/** What every pipeline needs: the database (secret key), CFBD, and the current time. */
export type JobContext = {
  db: Db;
  cfbd: CfbdClient;
  now: Date;
};
