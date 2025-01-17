import { SharedVaultInviteServerHash } from '../SharedVaults/SharedVaultInviteServerHash'
import { ApiEndpointParam } from './ApiEndpointParam'
import { ConflictParams } from './ConflictParams'
import { ServerItemResponse } from './ServerItemResponse'
import { SharedVaultServerHash } from '../SharedVaults/SharedVaultServerHash'
import { UserEventServerHash } from '../UserEvent/UserEventServerHash'
import { AsymmetricMessageServerHash } from '../AsymmetricMessage/AsymmetricMessageServerHash'

export type RawSyncData = {
  error?: unknown
  [ApiEndpointParam.LastSyncToken]?: string
  [ApiEndpointParam.PaginationToken]?: string
  retrieved_items?: ServerItemResponse[]
  saved_items?: ServerItemResponse[]
  conflicts?: ConflictParams[]
  unsaved?: ConflictParams[]
  shared_vaults?: SharedVaultServerHash[]
  shared_vault_invites?: SharedVaultInviteServerHash[]
  user_events?: UserEventServerHash[]
  asymmetric_messages?: AsymmetricMessageServerHash[]
  status?: number
}
