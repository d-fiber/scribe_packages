import { database, Get, type RequestContext, response } from "@scribe/sdk";

/** One row of the table this example reads. */
interface ItemRow extends Record<string, unknown> {
  item_id: string;
  name: string;
}

/**
 * Answers `GET /v1/example/items/<item_id>`.
 *
 * The brackets in the file name are the parameter, read back with `ctx.param`.
 */
export class ReadItem extends Get {
  /** Answers the item named by `item_id`, or a 404 when none matches. */
  protected override async run(ctx: RequestContext): Promise<Response> {
    const item = await database
      .from<ItemRow>("items")
      .where((row) => row.item_id.eq(ctx.param("item_id") ?? ""))
      .first();

    return item ? response.ok({ data: { item } }) : response.notFound();
  }
}
