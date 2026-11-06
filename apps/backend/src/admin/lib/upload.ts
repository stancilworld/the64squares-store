import { sdk } from "./sdk"

// Uploads one image through Medusa's file module and returns its public URL.
export const uploadImage = async (file: File): Promise<string> => {
  const { files } = await sdk.admin.upload.create({ files: [file] })
  return files[0].url
}

// Pictures the server converts (HEIC, JPG, PNG, WebP, AVIF, TIFF). Their size limit is
// checked after conversion on the server, so the admin doesn't reject them for size first.
const CONVERTED = /\.(heic|heif|jpe?g|png|webp|avif|tiff?)$/i
export const isConvertedPicture = (file: File) =>
  CONVERTED.test(file.name) || /^image\/(heic|heif|jpeg|png|webp|avif|tiff)$/i.test(file.type)

// The file picker filter for pictures, including iPhone HEIC photos (which Windows browsers
// don't label as images).
export const PICTURE_ACCEPT = "image/*,.heic,.heif"
