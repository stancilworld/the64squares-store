import { useParams } from "react-router-dom"
import { ProductFormPage } from "../../../lib/product-form"

// The one-page Stancil form for an existing product (from "Simple editor" on a product page).
const EditProductPage = () => {
  const { id } = useParams()
  return <ProductFormPage key={id} id={id} />
}

export default EditProductPage
