import {
  database,
  Get,
  Post,
  type RequestContext,
  Required,
  response,
} from "@scribe/sdk";

/** One row of the table this example reads. */
interface ItemRow extends Record<string, unknown> {
  item_id: string;
  name: string;
}

/**
 * Answers `GET /v1/example/items`.
 *
 * A file named `index` answers on the directory itself, so this one is the
 * collection and `[item_id].ts` next to it is one of its members.
 */
export class ListItems extends Get {
  /** Lists up to 50 items, ordered by name. */
  protected override async run(_: RequestContext): Promise<Response> {
    const items = await database
      .from<ItemRow>("items")
      .order("name")
      .limit(50)
      .rows();

    return response.ok({ data: { items } });
  }
}

/** Answers `POST /v1/example/items`. */
export class CreateItem extends Post {
  /** What the caller must hold, checked before `run` is reached. */
  protected override permissions(): readonly string[] {
    return ["item:create"];
  }

  /** Inserts a new item named by the request body. */
  protected override async run(ctx: RequestContext): Promise<Response> {
    const body = ctx.body({ name: Required(String) });
    if (!body) return response.badRequest();

    const [item] = await database.from<ItemRow>("items").insert({
      name: body.name,
    });

    return response.created({ data: { item } });
  }
}
