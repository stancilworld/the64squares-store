import ProductModule from "@medusajs/medusa/product"
import { defineLink } from "@medusajs/framework/utils"
import CharacterModule from "../modules/character"

// A character (e.g. Bella) has many products; each product belongs to at most one character.
export default defineLink(
  {
    linkable: ProductModule.linkable.product,
    isList: true,
  },
  CharacterModule.linkable.character
)
