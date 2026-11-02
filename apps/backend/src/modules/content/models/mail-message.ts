import { model } from "@medusajs/framework/utils"

// One email in the shop's mailbox (e.g. info@the64squares.in), copied from the mail server so the
// admin can show it (Messages → Email). `folder` is where it lives on the server; `uid` and
// `uidvalidity` find it there again (to download attachments or mark it read).
const MailMessage = model.define("mail_message", {
  id: model.id({ prefix: "mail" }).primaryKey(),
  folder: model.enum(["inbox", "sent"]),
  uid: model.number().nullable(),
  uidvalidity: model.text().nullable(),
  message_id: model.text().nullable(),
  in_reply_to: model.text().nullable(),
  references: model.json().nullable(),
  thread_id: model.text(),
  from_name: model.text().nullable(),
  from_email: model.text().nullable(),
  reply_to: model.text().nullable(),
  to: model.json(),
  cc: model.json().nullable(),
  subject: model.text().nullable(),
  text: model.text().nullable(),
  html: model.text().nullable(),
  snippet: model.text().nullable(),
  date: model.dateTime(),
  status: model.enum(["new", "read", "done"]).default("new"),
  // Starred to find again (the same as "flagged" in the webmail).
  starred: model.boolean().default(false),
  note: model.text().nullable(),
  attachments: model.json().nullable(),
  sent_by: model.text().nullable(),
})
  .indexes([
    { on: ["folder", "uidvalidity", "uid"] },
    { on: ["message_id"] },
    { on: ["thread_id"] },
  ])

export default MailMessage
