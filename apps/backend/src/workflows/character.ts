import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { CHARACTER_MODULE } from "../modules/character"
import CharacterModuleService from "../modules/character/service"

export type CharacterInput = {
  name?: string
  handle?: string
  greeting?: string
  tagline?: string | null
  story?: string | null
  image_url?: string | null
  banner_url?: string | null
  collection_title?: string | null
  status?: "live" | "coming_soon"
  coming_soon_text?: string
  rank?: number
}

const createCharacterStep = createStep(
  "create-character",
  async (input: CharacterInput, { container }) => {
    const service: CharacterModuleService = container.resolve(CHARACTER_MODULE)
    const character = await service.createCharacters(input as any)
    return new StepResponse(character, character.id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }
    const service: CharacterModuleService = container.resolve(CHARACTER_MODULE)
    await service.deleteCharacters(id)
  }
)

const updateCharacterStep = createStep(
  "update-character",
  async (input: { id: string; data: CharacterInput }, { container }) => {
    const service: CharacterModuleService = container.resolve(CHARACTER_MODULE)
    const previous = await service.retrieveCharacter(input.id)
    const character = await service.updateCharacters({
      id: input.id,
      ...input.data,
    } as any)
    return new StepResponse(character, previous)
  },
  async (previous, { container }) => {
    if (!previous) {
      return
    }
    const service: CharacterModuleService = container.resolve(CHARACTER_MODULE)
    const { created_at, updated_at, deleted_at, ...data } = previous as any
    await service.updateCharacters(data)
  }
)

const deleteCharacterStep = createStep(
  "delete-character",
  async (id: string, { container }) => {
    const service: CharacterModuleService = container.resolve(CHARACTER_MODULE)
    await service.softDeleteCharacters(id)
    return new StepResponse({ id }, id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }
    const service: CharacterModuleService = container.resolve(CHARACTER_MODULE)
    await service.restoreCharacters(id)
  }
)

type ProductCharacterInput = { product_id: string; character_id: string | null }

const setProductCharacterStep = createStep(
  "set-product-character",
  async (input: ProductCharacterInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const link = container.resolve(ContainerRegistrationKeys.LINK)
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "character.id"],
      filters: { id: input.product_id },
    })
    const previousId: string | null = (data[0] as any)?.character?.id ?? null
    if (previousId) {
      await link.dismiss({
        [Modules.PRODUCT]: { product_id: input.product_id },
        [CHARACTER_MODULE]: { character_id: previousId },
      })
    }
    if (input.character_id) {
      await link.create({
        [Modules.PRODUCT]: { product_id: input.product_id },
        [CHARACTER_MODULE]: { character_id: input.character_id },
      })
    }
    return new StepResponse(input, {
      product_id: input.product_id,
      previous_id: previousId,
      new_id: input.character_id,
    })
  },
  async (comp, { container }) => {
    if (!comp) {
      return
    }
    const link = container.resolve(ContainerRegistrationKeys.LINK)
    if (comp.new_id) {
      await link.dismiss({
        [Modules.PRODUCT]: { product_id: comp.product_id },
        [CHARACTER_MODULE]: { character_id: comp.new_id },
      })
    }
    if (comp.previous_id) {
      await link.create({
        [Modules.PRODUCT]: { product_id: comp.product_id },
        [CHARACTER_MODULE]: { character_id: comp.previous_id },
      })
    }
  }
)

export const createCharacterWorkflow = createWorkflow(
  "create-character",
  (input: CharacterInput) => {
    const character = createCharacterStep(input)
    return new WorkflowResponse(character)
  }
)

export const updateCharacterWorkflow = createWorkflow(
  "update-character",
  (input: { id: string; data: CharacterInput }) => {
    const character = updateCharacterStep(input)
    return new WorkflowResponse(character)
  }
)

export const deleteCharacterWorkflow = createWorkflow(
  "delete-character",
  (id: string) => {
    const result = deleteCharacterStep(id)
    return new WorkflowResponse(result)
  }
)

export const setProductCharacterWorkflow = createWorkflow(
  "set-product-character",
  (input: ProductCharacterInput) => {
    const result = setProductCharacterStep(input)
    return new WorkflowResponse(result)
  }
)
