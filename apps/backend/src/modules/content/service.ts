import { MedusaService } from "@medusajs/framework/utils"
import ChatSession from "./models/chat-session"
import ContactMessage from "./models/contact-message"
import ContentBlock from "./models/content-block"
import MailMessage from "./models/mail-message"
import Page from "./models/page"
import Setting from "./models/setting"
import TeamMember from "./models/team-member"

class ContentModuleService extends MedusaService({
  ChatSession,
  ContactMessage,
  ContentBlock,
  MailMessage,
  Page,
  Setting,
  TeamMember,
}) {
  // The stored value for a setting, or null when it has never been saved.
  async getSettingValue(key: string): Promise<Record<string, unknown> | null> {
    const [setting] = await this.listSettings({ key })
    return (setting?.value as Record<string, unknown> | undefined) ?? null
  }
}

export default ContentModuleService
