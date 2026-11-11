import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { passwordResetEmail, sendEmail } from "../lib/emails"

// "Forgot password" on the admin sign-in page: Medusa makes a short-lived token and emits
// this event; we email the link to the admin's reset page. (Shoppers sign in with a code,
// so they never get here.)
export default async function passwordReset({
  event,
  container,
}: SubscriberArgs<{ entity_id: string; token: string; actor_type: string }>) {
  const { entity_id: email, token, actor_type } = event.data
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  if (actor_type !== "user") {
    logger.info(`Password reset asked for a ${actor_type}; only admin accounts use passwords.`)
    return
  }
  const backend = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
  const link = `${backend}/app/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
  await sendEmail(container, email, "password-reset", passwordResetEmail(link))
}

export const config: SubscriberConfig = { event: "auth.password_reset" }
