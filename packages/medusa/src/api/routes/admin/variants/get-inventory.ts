import {
  IInventoryService,
  InventoryItemDTO,
  InventoryLevelDTO,
} from "@medusajs/types"
import { SalesChannel } from "../../../../models"
import {
  SalesChannelLocationService,
  SalesChannelService,
} from "../../../../services"
import ProductVariantService from "../../../../services/product-variant"
import ProductVariantInventoryService from "../../../../services/product-variant-inventory"
import { joinLevels } from "../inventory-items/utils/join-levels"

/**
 * @oas [get] /admin/variants/{id}/inventory
 * operationId: "GetVariantsVariantInventory"
 * summary: "Get Variant's Inventory"
 * description: "Retrieve the available inventory of a Product Variant."
 * x-authenticated: true
 * parameters:
 *   - (path) id {string} The Product Variant ID.
 * x-codegen:
 *   method: getInventory
 * x-codeSamples:
 *   - lang: JavaScript
 *     label: JS Client
 *     source: |
 *       import Medusa from "@medusajs/medusa-js"
 *       const medusa = new Medusa({ baseUrl: MEDUSA_BACKEND_URL, maxRetries: 3 })
 *       // must be previously logged in or use api token
 *       medusa.admin.variants.list()
 *       .then(({ variants, limit, offset, count }) => {
 *         console.log(variants.length)
 *       })
 *   - lang: Shell
 *     label: cURL
 *     source: |
 *       curl '{backend_url}/admin/variants' \
 *       -H 'Authorization: Bearer {api_token}'
 * security:
 *   - api_token: []
 *   - cookie_auth: []
 * tags:
 *   - Product Variants
 * responses:
 *   200:
 *     description: OK
 *     content:
 *       application/json:
 *         schema:
 *           type: object
 *           properties:
 *             variant:
 *               type: object
 *               $ref: "#/components/schemas/AdminGetVariantsVariantInventoryRes"
 *   "400":
 *     $ref: "#/components/responses/400_error"
 *   "401":
 *     $ref: "#/components/responses/unauthorized"
 *   "404":
 *     $ref: "#/components/responses/not_found_error"
 *   "409":
 *     $ref: "#/components/responses/invalid_state_error"
 *   "422":
 *     $ref: "#/components/responses/invalid_request_error"
 *   "500":
 *     $ref: "#/components/responses/500_error"
 */
export default async (req, res) => {
  const { id } = req.params

  const inventoryService: IInventoryService =
    req.scope.resolve("inventoryService")
  const channelLocationService: SalesChannelLocationService = req.scope.resolve(
    "salesChannelLocationService"
  )

  const channelService: SalesChannelService = req.scope.resolve(
    "salesChannelService"
  )
  const productVariantInventoryService: ProductVariantInventoryService =
    req.scope.resolve("productVariantInventoryService")

  const variantService: ProductVariantService = req.scope.resolve(
    "productVariantService"
  )

  const variant = await variantService.retrieve(id, { select: ["id"] })

  const responseVariant: VariantInventory = {
    id: variant.id,
    inventory: [],
    sales_channel_availability: [],
  }

  const [rawChannels] = await channelService.listAndCount({})
  const channels: SalesChannelDTO[] = await Promise.all(
    rawChannels.map(async (channel) => {
      const locationIds = await channelLocationService.listLocationIds(
        channel.id
      )
      return {
        ...channel,
        locations: locationIds,
      }
    })
  )

  const variantInventoryItems =
    await productVariantInventoryService.listByVariant(variant.id)

  const inventory =
    await productVariantInventoryService.listInventoryItemsByVariant(variant.id)
  responseVariant.inventory = await joinLevels(inventory, [], inventoryService)

  if (inventory.length) {
    responseVariant.sales_channel_availability = await Promise.all(
      channels.map(async (channel) => {
        if (!channel.locations.length) {
          return {
            channel_name: channel.name as string,
            channel_id: channel.id as string,
            available_quantity: 0,
          }
        }

        const quantity =
          // eslint-disable-next-line max-len
          await productVariantInventoryService.getVariantQuantityFromVariantInventoryItems(
            variantInventoryItems,
            channel.id
          )

        return {
          channel_name: channel.name as string,
          channel_id: channel.id as string,
          available_quantity: quantity,
        }
      })
    )
  }

  res.json({
    variant: responseVariant,
  })
}

type SalesChannelDTO = Omit<SalesChannel, "beforeInsert" | "locations"> & {
  locations: string[]
}

export type LevelWithAvailability = InventoryLevelDTO & {
  available_quantity: number
}

/**
 * @schema ResponseInventoryItem
 * allOf:
 *   - $ref: "#/components/schemas/InventoryItemDTO"
 *   - type: object
 *     properties:
 *       location_levels:
 *         type: array
 *         description: The inventory's location levels.
 *         items:
 *           allOf:
 *             - $ref: "#/components/schemas/InventoryItemDTO"
 *             - type: object
 *               required:
 *                 - available_quantity
 *               properties:
 *                 available_quantity:
 *                   description: The available quantity in the inventory location.
 *                   type: number
 */
export type ResponseInventoryItem = Partial<InventoryItemDTO> & {
  location_levels?: LevelWithAvailability[]
}

/**
 * @schema VariantInventory
 * type: object
 * required:
 *   - id
 *   - inventory
 *   - sales_channel_availability
 * properties:
 *   id:
 *     description: the ID of the variant
 *     type: string
 *   inventory:
 *     description: The inventory details.
 *     $ref: "#/components/schemas/ResponseInventoryItem"
 *   sales_channel_availability:
 *     type: array
 *     description: An array of details about the variant's inventory availability in sales channels.
 *     items:
 *       type: object
 *       required:
 *         - channel_name
 *         - channel_id
 *         - available_quantity
 *       properties:
 *         channel_name:
 *           description: Sales channel's name
 *           type: string
 *         channel_id:
 *           description: Sales channel's ID
 *           type: string
 *         available_quantity:
 *           description: Available quantity in the sales channel
 *           type: number
 */
export type VariantInventory = {
  id: string
  inventory: ResponseInventoryItem[]
  sales_channel_availability: {
    channel_name: string
    channel_id: string
    available_quantity: number
  }[]
}

/**
 * @schema AdminGetVariantsVariantInventoryRes
 * type: object
 * properties:
 *   variant:
 *     type: object
 *     description: "The product variant's."
 *     $ref: "#/components/schemas/VariantInventory"
 */
export type AdminGetVariantsVariantInventoryRes = {
  variant: VariantInventory
}
