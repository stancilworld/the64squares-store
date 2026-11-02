import en from "./json/en.json"

// Replaces the admin's built-in wording with Stancil's: the sign-in and invite pages, any
// mention of Medusa, and plainer menu names (Stock, Discounts, Sales & price lists).
// These are merged over the admin's built-in English (and British English) text.
export default {
  en: { translation: en },
  enGB: { translation: en },
}
