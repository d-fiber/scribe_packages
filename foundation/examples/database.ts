import { Table } from "@scribe/foundation/lib/src/database/table.ts";

/** One row of the orders table. */
interface OrderRow {
  /** The primary key. */
  id: string;

  /** The account the order belongs to, which is also the column the owner scope filters on. */
  account_id: string;

  /** What the order is worth, in cents. */
  total: number;

  /** Where the order stands: `pending`, `paid` or `cancelled`. */
  status: string;

  /** When the row was written. */
  created_at: string;
}

/**
 * The tables this example reads, as the query builder needs to see them.
 *
 * A project gets this from its generated schema; a package writes it by hand for the tables
 * whose SQL it owns. Either way the engine never holds a schema of its own, which is what
 * keeps it free of any knowledge of a particular database.
 */
type ShopSchema = {
  /** The orders a customer placed. */
  orders: { row: OrderRow };
};

/**
 * A handle on one table of the schema, which is what a generated `Database` class is.
 *
 * Constraining the name by `keyof S` makes the SQL the single source of truth: a table nobody
 * declared, or a name with a typo in it, does not compile.
 */
class ShopTable<K extends keyof ShopSchema & string> extends Table<ShopSchema, K> {}

/**
 * A handle is safe to keep at module scope.
 *
 * It holds neither a client nor an identity: the owner filter is decided when a query is
 * compiled, from whoever is calling then, so one built at import time serves every request
 * without carrying anything from the first.
 */
export const orders = new ShopTable("orders");

/** Reads a page, naming the columns it wants so the result type is the shape it asked for. */
export function recentOrders(since: string): Promise<{ id: string; total: number }[]> {
  return orders
    .select((o) => ({ id: o.id, total: o.total }))
    .where((f) => f.created_at.gte(since))
    .order("created_at", { ascending: false })
    .limit(50)
    .get();
}

/** Reads at most one row, answering null when nothing matches. */
export function orderById(id: string): Promise<OrderRow | null> {
  return orders.where((f) => f.id.eq(id)).getOne();
}

/** Several filters travel as an array, and they narrow together. */
export function pendingOver(amount: number): Promise<OrderRow[]> {
  return orders.where((f) => [f.status.eq("pending"), f.total.gt(amount)]).get();
}

/** Writes a row and answers it back, with the owner column filled in when it was left out. */
export function place(order: Partial<OrderRow>): Promise<OrderRow | null> {
  return orders.insertOne(order);
}

/**
 * Writes to the rows a filter names.
 *
 * A write with no filter is refused rather than applied to the table: `entireTable()` is how
 * a caller says that is what it meant.
 */
export function markPaid(id: string): Promise<boolean> {
  return orders.where((f) => f.id.eq(id)).update({ status: "paid" });
}

/**
 * Reads across owners, which the scope refuses unless the caller says so.
 *
 * `unscoped()` belongs to code that has already checked upstream who is allowed to cross.
 */
export function everyPendingOrder(): Promise<OrderRow[]> {
  return orders.unscoped().where((f) => f.status.eq("pending")).get();
}
