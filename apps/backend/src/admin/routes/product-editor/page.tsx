import { defineRouteConfig } from "@medusajs/admin-sdk"
import { PlusMini } from "@medusajs/icons"
import { ProductFormPage } from "../../lib/product-form"

// Products → Add product (simple): the one-page The 64 Squares product form.
const NewProductPage = () => <ProductFormPage />

export const config = defineRouteConfig({
  label: "Add product (simple)",
  icon: PlusMini,
  nested: "/products",
})

export default NewProductPage
