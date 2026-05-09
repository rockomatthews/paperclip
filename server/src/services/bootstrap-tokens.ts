import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { bootstrapTokens } from "@paperclipai/db";

export interface BootstrapTokenBinding {
  agentId: string;
  companyId: string;
  runId: string;
  jobUid: string;
}

export interface MintInput extends BootstrapTokenBinding {
  ttlSeconds: number;
}

export interface MintResult {
  token: string;
  expiresAt: Date;
}

export type ValidateResult =
  | { ok: true; binding: BootstrapTokenBinding }
  | { ok: false; reason: "not_found" | "expired" | "already_consumed" };

export interface BootstrapTokensService {
  mint(input: MintInput): Promise<MintResult>;
  validateAndConsume(token: string): Promise<ValidateResult>;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function bootstrapTokensService(db: Db): BootstrapTokensService {
  return {
    async mint(input) {
      const raw = randomBytes(32).toString("base64url");
      const token = `bst_${raw}`;
      const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);
      await db.insert(bootstrapTokens).values({
        tokenHash: hashToken(token),
        agentId: input.agentId,
        companyId: input.companyId,
        runId: input.runId,
        jobUid: input.jobUid,
        expiresAt,
      });
      return { token, expiresAt };
    },

    async validateAndConsume(token) {
      const hash = hashToken(token);
      const [row] = await db.select().from(bootstrapTokens).where(eq(bootstrapTokens.tokenHash, hash));
      if (!row) return { ok: false, reason: "not_found" };
      if (row.consumedAt) return { ok: false, reason: "already_consumed" };
      if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };
      await db.update(bootstrapTokens).set({ consumedAt: new Date() }).where(eq(bootstrapTokens.id, row.id));
      return {
        ok: true,
        binding: { agentId: row.agentId, companyId: row.companyId, runId: row.runId, jobUid: row.jobUid },
      };
    },
  };
}
