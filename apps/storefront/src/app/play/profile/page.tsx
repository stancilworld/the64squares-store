import type { Metadata } from "next"
import { Suspense } from "react"
import { ProfileEditor } from "@/components/play/profile-editor"
import { getPlayPass } from "@/lib/play"
import { Loading } from "../loading-text"

export const metadata: Metadata = { title: "Your profile", robots: { index: false } }

async function Editor() {
  const pass = await getPlayPass()
  return <ProfileEditor initialPass={pass} />
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Editor />
    </Suspense>
  )
}
