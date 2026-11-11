import { MedusaService } from "@medusajs/framework/utils"
import NewsArticle from "./models/article"

class NewsModuleService extends MedusaService({
  NewsArticle,
}) {}

export default NewsModuleService
