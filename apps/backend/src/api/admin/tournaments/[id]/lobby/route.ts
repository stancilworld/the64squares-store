import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { addModerator, deleteLobbyMessage, liftMute, lobbyState, removeModerator, saveLobbySettings } from "../../../../../lib/lobby-admin"
import type { LobbyAdminBodyType } from "../../../validators"

// GET /admin/tournaments/:id/lobby: the lobby's moderators, settings, mutes and chat log.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json(await lobbyState(req.scope, req.params.id))
}

// POST /admin/tournaments/:id/lobby: add or remove a moderator (for this tournament or all),
// delete a message, change the chat settings, or lift a mute.
export const POST = async (req: AuthenticatedMedusaRequest<LobbyAdminBodyType>, res: MedusaResponse) => {
  const b = req.validatedBody
  const tid = req.params.id
  const by = req.auth_context.actor_id
  let message = "Saved."
  if (b.action === "add_moderator") message = `${await addModerator(req.scope, b.all ? "*" : tid, b.email, by)} is now a moderator${b.all ? " for every tournament" : ""}.`
  if (b.action === "remove_moderator") {
    await removeModerator(req.scope, b.all ? "*" : tid, b.player_id)
    message = "Moderator removed."
  }
  if (b.action === "delete_message") {
    await deleteLobbyMessage(req.scope, tid, b.id, by)
    message = "Message deleted."
  }
  if (b.action === "settings") await saveLobbySettings(req.scope, tid, b, by)
  if (b.action === "lift_mute") {
    await liftMute(req.scope, tid, b.player_id)
    message = "They can chat again."
  }
  res.json({ message })
}
