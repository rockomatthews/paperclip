import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEmbeddedPostgresTestDatabase, type EmbeddedPostgresTestDatabase, createDb } from "@paperclipai/db";
import type { Db } from "@paperclipai/db";
import { bootstrapTokensService } from "./bootstrap-tokens.js";

let dbHandle: EmbeddedPostgresTestDatabase;
let db: Db;

beforeAll(async () => {
  dbHandle = await startEmbeddedPostgresTestDatabase("paperclip-bs-tokens-");
  db = createDb(dbHandle.connectionString);
});
afterAll(async () => { await dbHandle.cleanup(); });

describe("bootstrapTokensService", () => {
  it("mints a token, validates it once, then rejects replay", async () => {
    const svc = bootstrapTokensService(db);
    const minted = await svc.mint({
      agentId: "11111111-1111-1111-1111-111111111111",
      companyId: "22222222-2222-2222-2222-222222222222",
      runId: "r-1", jobUid: "job-uid-1",
      ttlSeconds: 600,
    });
    expect(minted.token).toMatch(/^bst_/);

    const v1 = await svc.validateAndConsume(minted.token);
    expect(v1.ok).toBe(true);
    if (v1.ok) {
      expect(v1.binding.runId).toBe("r-1");
      expect(v1.binding.jobUid).toBe("job-uid-1");
    }

    const v2 = await svc.validateAndConsume(minted.token);
    expect(v2.ok).toBe(false);
    if (!v2.ok) expect(v2.reason).toBe("already_consumed");
  });

  it("rejects an expired token", async () => {
    const svc = bootstrapTokensService(db);
    const minted = await svc.mint({
      agentId: "11111111-1111-1111-1111-111111111112",
      companyId: "22222222-2222-2222-2222-222222222223",
      runId: "r-2", jobUid: "job-uid-2",
      ttlSeconds: 1,
    });
    await new Promise((r) => setTimeout(r, 1100));
    const v = await svc.validateAndConsume(minted.token);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("expired");
  });

  it("rejects an unknown token with reason=not_found", async () => {
    const svc = bootstrapTokensService(db);
    const v = await svc.validateAndConsume("bst_thisisnotreal");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("not_found");
  });
});
