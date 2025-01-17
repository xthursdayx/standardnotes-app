import * as Factory from './factory.js'

export const createContactContext = async () => {
  const contactContext = await Factory.createAppContextWithRealCrypto()
  await contactContext.launch()
  await contactContext.register()

  return {
    contactContext,
    deinitContactContext: contactContext.deinit.bind(contactContext),
  }
}

export const createTrustedContactForUserOfContext = async (
  contextAddingNewContact,
  contextImportingContactInfoFrom,
) => {
  const contact = await contextAddingNewContact.contacts.createOrEditTrustedContact({
    name: 'John Doe',
    publicKey: contextImportingContactInfoFrom.publicKey,
    signingPublicKey: contextImportingContactInfoFrom.signingPublicKey,
    contactUuid: contextImportingContactInfoFrom.userUuid,
  })

  return contact
}

export const acceptAllInvites = async (context) => {
  const inviteRecords = context.vaultInvites.getCachedPendingInviteRecords()
  if (inviteRecords.length === 0) {
    throw new Error('No pending invites to accept')
  }

  for (const record of inviteRecords) {
    await context.vaultInvites.acceptInvite(record)
  }
}

export const createSharedVaultWithAcceptedInvite = async (context, permissions = SharedVaultPermission.Write) => {
  const { sharedVault, contact, contactContext, deinitContactContext } =
    await createSharedVaultWithUnacceptedButTrustedInvite(context, permissions)

  const promise = contactContext.awaitNextSyncSharedVaultFromScratchEvent()

  await acceptAllInvites(contactContext)

  await promise

  const contactVault = contactContext.vaults.getVault({ keySystemIdentifier: sharedVault.systemIdentifier })

  return { sharedVault, contact, contactVault, contactContext, deinitContactContext }
}

export const createSharedVaultWithAcceptedInviteAndNote = async (
  context,
  permissions = SharedVaultPermission.Write,
) => {
  const { sharedVault, contactContext, contact, deinitContactContext } = await createSharedVaultWithAcceptedInvite(
    context,
    permissions,
  )
  const note = await context.createSyncedNote('foo', 'bar')
  const updatedNote = await moveItemToVault(context, sharedVault, note)
  await contactContext.sync()

  return { sharedVault, note: updatedNote, contact, contactContext, deinitContactContext }
}

export const createSharedVaultWithUnacceptedButTrustedInvite = async (
  context,
  permissions = SharedVaultPermission.Write,
) => {
  const sharedVault = await createSharedVault(context)

  const { contactContext, deinitContactContext } = await createContactContext()
  const contact = await createTrustedContactForUserOfContext(context, contactContext)
  await createTrustedContactForUserOfContext(contactContext, context)

  const invite = (await context.vaultInvites.inviteContactToSharedVault(sharedVault, contact, permissions)).getValue()
  await contactContext.sync()

  return { sharedVault, contact, contactContext, deinitContactContext, invite }
}

export const createSharedVaultAndInviteContact = async (
  createInContext,
  inviteContext,
  inviteContact,
  permissions = SharedVaultPermission.Write,
) => {
  const sharedVault = await createSharedVault(createInContext)

  await createInContext.vaultInvites.inviteContactToSharedVault(sharedVault, inviteContact, permissions)

  const promise = inviteContext.awaitNextSyncSharedVaultFromScratchEvent()

  await inviteContext.sync()

  await acceptAllInvites(inviteContext)

  await promise

  return { sharedVault }
}

export const createSharedVaultWithUnacceptedAndUntrustedInvite = async (
  context,
  permissions = SharedVaultPermission.Write,
) => {
  const sharedVault = await createSharedVault(context)

  const { contactContext, deinitContactContext } = await createContactContext()
  const contact = await createTrustedContactForUserOfContext(context, contactContext)

  const invite = (await context.vaultInvites.inviteContactToSharedVault(sharedVault, contact, permissions)).getValue()
  await contactContext.sync()

  return { sharedVault, contact, contactContext, deinitContactContext, invite }
}

export const inviteNewPartyToSharedVault = async (context, sharedVault, permissions = SharedVaultPermission.Write) => {
  const { contactContext: thirdPartyContext, deinitContactContext: deinitThirdPartyContext } =
    await createContactContext()

  const thirdPartyContact = await createTrustedContactForUserOfContext(context, thirdPartyContext)
  await createTrustedContactForUserOfContext(thirdPartyContext, context)
  await context.vaultInvites.inviteContactToSharedVault(sharedVault, thirdPartyContact, permissions)

  await thirdPartyContext.sync()

  return { thirdPartyContext, thirdPartyContact, deinitThirdPartyContext }
}

export const createPrivateVault = async (context) => {
  const privateVault = await context.vaults.createRandomizedVault({
    name: 'My Private Vault',
  })

  return privateVault
}

export const createSharedVault = async (context) => {
  const sharedVault = await context.sharedVaults.createSharedVault({ name: 'My Shared Vault' })

  if (isClientDisplayableError(sharedVault)) {
    throw new Error(sharedVault.text)
  }

  return sharedVault
}

export const createSharedVaultWithNote = async (context) => {
  const sharedVault = await createSharedVault(context)
  const note = await context.createSyncedNote()
  const updatedNote = await moveItemToVault(context, sharedVault, note)
  return { sharedVault, note: updatedNote }
}

export const moveItemToVault = async (context, sharedVault, item) => {
  const promise = context.resolveWhenItemCompletesAddingToVault(item)
  const updatedItem = await context.vaults.moveItemToVault(sharedVault, item)
  await promise
  return updatedItem
}
