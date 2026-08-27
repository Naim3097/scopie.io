import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PoolClient } from "pg";
import { Db } from "../db";

export interface LedgerLeg {
  accountId: string;
  /** Signed integer sen (MYR) or whole credits (SCOP). */
  amount: number;
  currency: "MYR" | "SCOP";
}

/**
 * Double-entry ledger over Postgres. Regulatory design: this RECORDS positions
 * (escrow, seller payables, SCOP credits); Scopie holds no stored buyer value.
 *
 * Integrity model (defense in depth):
 *  1. Zero-sum checked here before any write.
 *  2. `ledger_txns` unique (ref_type, ref_id) makes every business event
 *     idempotent at the database — a replayed webhook or retried release
 *     posts nothing the second time.
 *  3. A deferred DB constraint trigger re-checks zero-sum at commit, so no
 *     other writer can post an unbalanced transaction either.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  /** In-memory fallback so demo mode still demonstrates balances. */
  private memory: Array<LedgerLeg & { txnId: string; refType: string; refId: string }> = [];
  private memoryRefs = new Set<string>();

  constructor(@Inject(Db) private readonly db: Db) {}

  /**
   * Post one balanced transaction. Pass `client` to make the posting part of
   * an outer Postgres transaction (e.g. an order status flip + its ledger
   * legs must commit or roll back together).
   * Returns false when (refType, refId) was already posted (idempotent skip).
   */
  async post(
    txnId: string,
    refType: string,
    refId: string,
    legs: LedgerLeg[],
    client?: PoolClient,
  ): Promise<boolean> {
    const sums = new Map<string, number>();
    for (const leg of legs) {
      if (!Number.isInteger(leg.amount)) throw new Error("ledger amounts must be integers");
      sums.set(leg.currency, (sums.get(leg.currency) ?? 0) + leg.amount);
    }
    for (const [currency, sum] of sums) {
      if (sum !== 0) throw new Error(`unbalanced ledger txn ${txnId}: ${currency} sums to ${sum}`);
    }

    const pool = this.db.get();
    if (!pool) {
      const refKey = `${refType}|${refId}`;
      if (this.memoryRefs.has(refKey)) return false;
      this.memoryRefs.add(refKey);
      this.memory.push(...legs.map((l) => ({ ...l, txnId, refType, refId })));
      return true;
    }

    const run = async (c: PoolClient): Promise<boolean> => {
      const header = await c.query(
        `insert into ledger_txns (txn_id, ref_type, ref_id) values ($1,$2,$3)
         on conflict (ref_type, ref_id) do nothing returning txn_id`,
        [txnId, refType, refId],
      );
      if (header.rowCount === 0) {
        this.logger.warn(`ledger txn skipped — (${refType}, ${refId}) already posted`);
        return false;
      }
      for (const leg of legs) {
        await c.query(
          `insert into ledger_accounts (id, kind, currency) values ($1,$2,$3) on conflict (id) do nothing`,
          [leg.accountId, this.kindOf(leg.accountId), leg.currency],
        );
        await c.query(
          `insert into ledger_entries (txn_id, account_id, amount, currency, ref_type, ref_id)
           values ($1,$2,$3,$4,$5,$6)`,
          [txnId, leg.accountId, leg.amount, leg.currency, refType, refId],
        );
      }
      return true;
    };

    if (client) return run(client); // caller owns begin/commit
    const owned = await pool.connect();
    try {
      await owned.query("begin");
      const posted = await run(owned);
      await owned.query("commit");
      return posted;
    } catch (err) {
      await owned.query("rollback");
      throw err;
    } finally {
      owned.release();
    }
  }

  /** Earned-only credits — there is deliberately no "buy SCOP" path. `grantId` is the idempotency key. */
  async grantScop(userId: string, reason: string, credits: number, grantId: string): Promise<boolean> {
    return this.post(crypto.randomUUID(), "scop_grant", grantId, [
      { accountId: "scop:pool", amount: -credits, currency: "SCOP" },
      { accountId: `scop:${userId}`, amount: credits, currency: "SCOP" },
    ]);
  }

  /** Exact account ids only — never pattern matching (a `%` in a user id must not aggregate other accounts). */
  async balancesFor(accountIds: string[]): Promise<Array<{ accountId: string; currency: string; balance: number }>> {
    if (accountIds.length === 0) return [];
    const pool = this.db.get();
    if (!pool) {
      const wanted = new Set(accountIds);
      const map = new Map<string, { accountId: string; currency: string; balance: number }>();
      for (const e of this.memory) {
        if (!wanted.has(e.accountId)) continue;
        const key = `${e.accountId}|${e.currency}`;
        const row = map.get(key) ?? { accountId: e.accountId, currency: e.currency, balance: 0 };
        row.balance += e.amount;
        map.set(key, row);
      }
      return [...map.values()];
    }
    const res = await pool.query(
      `select account_id, currency, balance from ledger_balances where account_id = any($1)`,
      [accountIds],
    );
    return res.rows.map((r) => ({
      accountId: r.account_id as string,
      currency: r.currency as string,
      balance: Number(r.balance),
    }));
  }

  private kindOf(accountId: string): string {
    if (accountId.startsWith("external:")) return "external";
    if (accountId.startsWith("platform:fees")) return "platform_fees";
    if (accountId.startsWith("escrow:")) return "escrow";
    if (accountId.startsWith("seller:")) return "seller_payable";
    if (accountId === "scop:pool") return "scop_pool";
    if (accountId.startsWith("scop:")) return "scop_user";
    throw new Error(`unknown account family: ${accountId}`);
  }
}
