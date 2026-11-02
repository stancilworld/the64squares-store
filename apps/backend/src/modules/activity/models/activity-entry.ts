import { model } from "@medusajs/framework/utils"

// One thing someone did in the admin (Settings → Activity log), or a sign-in attempt.
const ActivityEntry = model
  .define("activity_entry", {
    id: model.id({ prefix: "act" }).primaryKey(),
    actor_id: model.text().nullable(),
    actor_name: model.text().nullable(),
    // Plain-language description, e.g. "Changed product".
    action: model.text(),
    // Menu area: Orders, Products, Customers, Discounts, Website, Settings, Staff, Sign-in.
    area: model.text(),
    target_type: model.text().nullable(),
    target_id: model.text().nullable(),
    method: model.text(),
    path: model.text(),
    status: model.number(),
    ip: model.text().nullable(),
  })
  .indexes([{ on: ["created_at"] }, { on: ["actor_id"] }, { on: ["area"] }])

export default ActivityEntry
