import { model } from "@medusajs/framework/utils"

// A message sent with the form on the Contact page. `answers` keeps every field as it was
// asked at the time ({ label, type, value }), so later changes to the form don't change old
// messages.
const ContactMessage = model.define("contact_message", {
  id: model.id({ prefix: "cmsg" }).primaryKey(),
  name: model.text().nullable(),
  email: model.text().nullable(),
  phone: model.text().nullable(),
  topic: model.text().nullable(),
  answers: model.json(),
  status: model.enum(["new", "read", "done"]).default("new"),
  note: model.text().nullable(),
  ip: model.text().nullable(),
})

export default ContactMessage
