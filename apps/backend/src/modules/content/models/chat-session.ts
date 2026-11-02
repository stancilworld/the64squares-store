import { model } from "@medusajs/framework/utils"

// One visitor's conversation with the website's chat bot (admin → Website → Chat bot →
// Past chats). `messages` is [{ role: "user" | "bot", text, source?, at }], newest last.
const ChatSession = model.define("chat_session", {
  id: model.id({ prefix: "chat" }).primaryKey(),
  session_key: model.text(),
  messages: model.json(),
  page: model.text().nullable(),
  ip: model.text().nullable(),
  ai_count: model.number().default(0),
  handed_over: model.boolean().default(false),
  last_at: model.dateTime(),
}).indexes([{ on: ["session_key"] }, { on: ["last_at"] }])

export default ChatSession
