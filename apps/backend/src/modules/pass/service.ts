import { MedusaService } from "@medusajs/framework/utils"
import PassEntry from "./models/pass-entry"

class PassModuleService extends MedusaService({ PassEntry }) {
  async balanceOf(customerId: string) {
    const rows = await this.listPassEntries({ customer_id: customerId }, { select: ["delta"], take: 100000 })
    return rows.reduce((s, r) => s + r.delta, 0)
  }
}

export default PassModuleService
