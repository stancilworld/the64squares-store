import { sdk } from "./sdk"

// Uploads one image through Medusa's file module and returns its public URL.
export const uploadImage = async (file: File): Promise<string> => {
  const { files } = await sdk.admin.upload.create({ files: [file] })
  return files[0].url
}
