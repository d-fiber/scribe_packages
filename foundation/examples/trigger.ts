import { Trigger } from "@scribe/foundation/lib/src/trigger/mod.ts";

/** One row of the orders table, as the bodies below read it. */
interface OrderRow {
  /** The primary key, which is the column a declaration keys on unless it names another. */
  id: string;

  /** The account the order belongs to. */
  account_id: string;

  /** Where the order stands. */
  status: string;

  /** What the order is worth, in cents. */
  total: number;
}

/**
 * The five methods, bound once to the type of the rows the table holds.
 *
 * The row type is named rather than inferred: the engine is not allowed to know a project's
 * schema. Nothing is armed until a method is called, so one handle serves a whole file.
 */
const orders = Trigger.of<OrderRow>();

/**
 * Fires once per row written into the table the path names.
 *
 * The project writes no SQL. The trigger already sits on every table of `public`, and what a
 * declaration changes is a row the process writes when it boots.
 */
export const onOrderPlaced = orders.onInsert(
  "orders/{orderId}",
  async (change) => {
    await confirm(change.after.account_id, change.params.orderId);
  },
);

/** Fires for every write that leaves the row different from what it was. */
export const onOrderTouched = orders.onUpdate(
  "orders/{orderId}",
  async (change) => {
    await audit(change.before.status, change.after.status);
  },
);

/** Fires once per row removed, and the body reads the values it had just before it went. */
export const onOrderDropped = orders.onDelete(
  "orders/{orderId}",
  async (change) => {
    await release(change.before.id);
  },
);

/**
 * Fires when one column holds a value it did not hold before.
 *
 * `update of <column>` fires on assignment and not on change, so `set status = status` would
 * reach a body written in SQL. The comparison is made here instead, which is what this method
 * is for. `when` narrows it further to the transition worth waking up for.
 */
export const onOrderPaid = orders.onFieldChange(
  { path: "orders/{orderId}/status", when: { from: "pending", to: "paid" } },
  async (change) => {
    await ship(change.row.id, change.after);
  },
);

/**
 * Watches several columns, and calls the body once per column that moved.
 *
 * Testing `change.field` narrows the two values with it, so `change.after` inside the branch
 * is the type of the column the branch names.
 */
export const onOrderRevised = orders.onFieldsChange(
  { path: "orders/{orderId}", observe: ["status", "total"], name: "order-revised" },
  async (change) => {
    if (change.field === "total") await reprice(change.after);
  },
);

function confirm(_accountId: string, _orderId: string): Promise<void> {
  return Promise.resolve();
}

function audit(_before: string, _after: string): Promise<void> {
  return Promise.resolve();
}

function release(_orderId: string): Promise<void> {
  return Promise.resolve();
}

function ship(_orderId: string, _status: string): Promise<void> {
  return Promise.resolve();
}

function reprice(_total: number): Promise<void> {
  return Promise.resolve();
}
