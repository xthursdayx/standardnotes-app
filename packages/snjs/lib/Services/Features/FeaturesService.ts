import { MigrateFeatureRepoToUserSettingUseCase } from './UseCase/MigrateFeatureRepoToUserSetting'
import { arraysEqual, removeFromArray, lastElement } from '@standardnotes/utils'
import { ClientDisplayableError } from '@standardnotes/responses'
import { RoleName, ContentType } from '@standardnotes/domain-core'
import { PROD_OFFLINE_FEATURES_URL } from '../../Hosts'
import { PureCryptoInterface } from '@standardnotes/sncrypto-common'
import { WebSocketsService } from '../Api/WebsocketsService'
import { WebSocketsServiceEvent } from '../Api/WebSocketsServiceEvent'
import { TRUSTED_CUSTOM_EXTENSIONS_HOSTS, TRUSTED_FEATURE_HOSTS } from '@Lib/Hosts'
import { UserRolesChangedEvent } from '@standardnotes/domain-events'
import { ExperimentalFeatures, FindNativeFeature, FeatureIdentifier } from '@standardnotes/features'
import {
  SNFeatureRepo,
  FeatureRepoContent,
  FillItemContent,
  PayloadEmitSource,
  ComponentInterface,
  ThemeInterface,
  DecryptedItemInterface,
} from '@standardnotes/models'
import {
  AbstractService,
  AlertService,
  ApiServiceEvent,
  API_MESSAGE_FAILED_OFFLINE_ACTIVATION,
  API_MESSAGE_UNTRUSTED_EXTENSIONS_WARNING,
  ApplicationStage,
  ButtonType,
  FeaturesClientInterface,
  FeaturesEvent,
  FeatureStatus,
  InternalEventBusInterface,
  InternalEventHandlerInterface,
  InternalEventInterface,
  INVALID_EXTENSION_URL,
  MetaReceivedData,
  OfflineSubscriptionEntitlements,
  SetOfflineFeaturesFunctionResponse,
  StorageKey,
  MutatorClientInterface,
  StorageServiceInterface,
  LegacyApiServiceInterface,
  ItemManagerInterface,
  SyncServiceInterface,
  SessionsClientInterface,
  UserClientInterface,
  SubscriptionManagerInterface,
  AccountEvent,
  SubscriptionManagerEvent,
  ApplicationEvent,
  ApplicationStageChangedEventPayload,
} from '@standardnotes/services'

import { DownloadRemoteThirdPartyFeatureUseCase } from './UseCase/DownloadRemoteThirdPartyFeature'
import { MigrateFeatureRepoToOfflineEntitlementsUseCase } from './UseCase/MigrateFeatureRepoToOfflineEntitlements'
import { GetFeatureStatusUseCase } from './UseCase/GetFeatureStatus'
import { SettingsClientInterface } from '../Settings/SettingsClientInterface'

type GetOfflineSubscriptionDetailsResponse = OfflineSubscriptionEntitlements | ClientDisplayableError

export class FeaturesService
  extends AbstractService<FeaturesEvent>
  implements FeaturesClientInterface, InternalEventHandlerInterface
{
  private onlineRoles: string[] = []
  private offlineRoles: string[] = []
  private enabledExperimentalFeatures: FeatureIdentifier[] = []

  private getFeatureStatusUseCase = new GetFeatureStatusUseCase(this.items)

  constructor(
    private storage: StorageServiceInterface,
    private items: ItemManagerInterface,
    private mutator: MutatorClientInterface,
    private subscriptions: SubscriptionManagerInterface,
    private api: LegacyApiServiceInterface,
    sockets: WebSocketsService,
    private settings: SettingsClientInterface,
    private user: UserClientInterface,
    private sync: SyncServiceInterface,
    private alerts: AlertService,
    private sessions: SessionsClientInterface,
    private crypto: PureCryptoInterface,
    protected override internalEventBus: InternalEventBusInterface,
  ) {
    super(internalEventBus)

    this.eventDisposers.push(
      sockets.addEventObserver(async (eventName, data) => {
        if (eventName === WebSocketsServiceEvent.UserRoleMessageReceived) {
          const currentRoles = (data as UserRolesChangedEvent).payload.currentRoles
          void this.updateOnlineRolesWithNewValues(currentRoles)
        }
      }),
    )

    this.eventDisposers.push(
      subscriptions.addEventObserver((event) => {
        if (event === SubscriptionManagerEvent.DidFetchSubscription) {
          void this.notifyEvent(FeaturesEvent.FeaturesAvailabilityChanged)
        }
      }),
    )

    this.eventDisposers.push(
      this.items.addObserver(ContentType.TYPES.ExtensionRepo, async ({ changed, inserted, source }) => {
        const sources = [
          PayloadEmitSource.InitialObserverRegistrationPush,
          PayloadEmitSource.LocalInserted,
          PayloadEmitSource.LocalDatabaseLoaded,
          PayloadEmitSource.RemoteRetrieved,
          PayloadEmitSource.FileImport,
        ]

        if (sources.includes(source)) {
          const items = [...changed, ...inserted] as SNFeatureRepo[]
          if (this.sessions.isSignedIntoFirstPartyServer()) {
            void this.migrateFeatureRepoToUserSetting(items)
          } else {
            void this.migrateFeatureRepoToOfflineEntitlements(items)
          }
        }
      }),
    )

    this.eventDisposers.push(
      this.user.addEventObserver((eventName: AccountEvent) => {
        if (eventName === AccountEvent.SignedInOrRegistered) {
          const featureRepos = this.items.getItems(ContentType.TYPES.ExtensionRepo) as SNFeatureRepo[]

          if (!this.api.isThirdPartyHostUsed()) {
            void this.migrateFeatureRepoToUserSetting(featureRepos)
          }
        }
      }),
    )
  }

  public initializeFromDisk(): void {
    this.onlineRoles = this.storage.getValue<string[]>(StorageKey.UserRoles, undefined, [])

    this.offlineRoles = this.storage.getValue<string[]>(StorageKey.OfflineUserRoles, undefined, [])

    this.enabledExperimentalFeatures = this.storage.getValue(StorageKey.ExperimentalFeatures, undefined, [])
  }

  async handleEvent(event: InternalEventInterface): Promise<void> {
    if (event.type === ApiServiceEvent.MetaReceived) {
      if (!this.sync) {
        this.log('Handling events interrupted. Sync service is not yet initialized.', event)
        return
      }

      const { userRoles } = event.payload as MetaReceivedData
      void this.updateOnlineRolesWithNewValues(userRoles.map((role) => role.name))
    }

    if (event.type === ApplicationEvent.ApplicationStageChanged) {
      const stage = (event.payload as ApplicationStageChangedEventPayload).stage
      if (stage === ApplicationStage.FullSyncCompleted_13) {
        if (!this.hasFirstPartyOnlineSubscription()) {
          const offlineRepo = this.getOfflineRepo()

          if (offlineRepo) {
            void this.downloadOfflineRoles(offlineRepo)
          }
        }
      }
    }
  }

  public enableExperimentalFeature(identifier: FeatureIdentifier): void {
    this.enabledExperimentalFeatures.push(identifier)

    void this.storage.setValue(StorageKey.ExperimentalFeatures, this.enabledExperimentalFeatures)

    void this.notifyEvent(FeaturesEvent.FeaturesAvailabilityChanged)
  }

  public disableExperimentalFeature(identifier: FeatureIdentifier): void {
    removeFromArray(this.enabledExperimentalFeatures, identifier)

    void this.storage.setValue(StorageKey.ExperimentalFeatures, this.enabledExperimentalFeatures)

    const component = this.items
      .getItems<ComponentInterface | ThemeInterface>([ContentType.TYPES.Component, ContentType.TYPES.Theme])
      .find((component) => component.identifier === identifier)
    if (!component) {
      return
    }

    void this.mutator.setItemToBeDeleted(component).then(() => {
      void this.sync.sync()
    })
    void this.notifyEvent(FeaturesEvent.FeaturesAvailabilityChanged)
  }

  public toggleExperimentalFeature(identifier: FeatureIdentifier): void {
    if (this.isExperimentalFeatureEnabled(identifier)) {
      this.disableExperimentalFeature(identifier)
    } else {
      this.enableExperimentalFeature(identifier)
    }
  }

  public getExperimentalFeatures(): FeatureIdentifier[] {
    return ExperimentalFeatures
  }

  public isExperimentalFeature(featureId: FeatureIdentifier): boolean {
    return this.getExperimentalFeatures().includes(featureId)
  }

  public getEnabledExperimentalFeatures(): FeatureIdentifier[] {
    return this.enabledExperimentalFeatures
  }

  public isExperimentalFeatureEnabled(featureId: FeatureIdentifier): boolean {
    return this.enabledExperimentalFeatures.includes(featureId)
  }

  public async setOfflineFeaturesCode(code: string): Promise<SetOfflineFeaturesFunctionResponse> {
    try {
      const activationCodeWithoutSpaces = code.replace(/\s/g, '')
      const decodedData = this.crypto.base64Decode(activationCodeWithoutSpaces)
      const result = this.parseOfflineEntitlementsCode(decodedData)

      if (result instanceof ClientDisplayableError) {
        return result
      }

      const offlineRepo = (await this.mutator.createItem(
        ContentType.TYPES.ExtensionRepo,
        FillItemContent({
          offlineFeaturesUrl: result.featuresUrl,
          offlineKey: result.extensionKey,
          migratedToOfflineEntitlements: true,
        } as FeatureRepoContent),
        true,
      )) as SNFeatureRepo

      void this.sync.sync()

      return this.downloadOfflineRoles(offlineRepo)
    } catch (err) {
      return new ClientDisplayableError(`${API_MESSAGE_FAILED_OFFLINE_ACTIVATION}, ${err}`)
    }
  }

  private getOfflineRepo(): SNFeatureRepo | undefined {
    const repos = this.items.getItems(ContentType.TYPES.ExtensionRepo) as SNFeatureRepo[]
    return repos.filter((repo) => repo.migratedToOfflineEntitlements)[0]
  }

  public hasOfflineRepo(): boolean {
    return this.getOfflineRepo() != undefined
  }

  public async deleteOfflineFeatureRepo(): Promise<void> {
    const repo = this.getOfflineRepo()

    if (repo) {
      await this.mutator.setItemToBeDeleted(repo)
      void this.sync.sync()
    }
  }

  private parseOfflineEntitlementsCode(code: string): GetOfflineSubscriptionDetailsResponse | ClientDisplayableError {
    try {
      const { featuresUrl, extensionKey } = JSON.parse(code)
      return {
        featuresUrl,
        extensionKey,
      }
    } catch (error) {
      return new ClientDisplayableError(API_MESSAGE_FAILED_OFFLINE_ACTIVATION)
    }
  }

  private async downloadOfflineRoles(repo: SNFeatureRepo): Promise<SetOfflineFeaturesFunctionResponse> {
    const result = await this.api.downloadOfflineFeaturesFromRepo(repo)

    if (result instanceof ClientDisplayableError) {
      return result
    }

    this.setOfflineRoles(result.roles)
  }

  public async migrateFeatureRepoToUserSetting(featureRepos: SNFeatureRepo[] = []): Promise<void> {
    const usecase = new MigrateFeatureRepoToUserSettingUseCase(this.mutator, this.settings)
    await usecase.execute(featureRepos)
  }

  public async migrateFeatureRepoToOfflineEntitlements(featureRepos: SNFeatureRepo[] = []): Promise<void> {
    const usecase = new MigrateFeatureRepoToOfflineEntitlementsUseCase(this.mutator)
    const updatedRepos = await usecase.execute(featureRepos)

    if (updatedRepos.length > 0) {
      await this.downloadOfflineRoles(updatedRepos[0])
    }
  }

  hasPaidAnyPartyOnlineOrOfflineSubscription(): boolean {
    return this.onlineRolesIncludePaidSubscription() || this.hasOfflineRepo()
  }

  private hasFirstPartyOnlineSubscription(): boolean {
    return this.sessions.isSignedIntoFirstPartyServer() && this.subscriptions.hasOnlineSubscription()
  }

  public hasFirstPartyOfflineSubscription(): boolean {
    const offlineRepo = this.getOfflineRepo()
    if (!offlineRepo || !offlineRepo.content.offlineFeaturesUrl) {
      return false
    }

    const hasFirstPartyOfflineSubscription = offlineRepo.content.offlineFeaturesUrl === PROD_OFFLINE_FEATURES_URL
    return hasFirstPartyOfflineSubscription || new URL(offlineRepo.content.offlineFeaturesUrl).hostname === 'localhost'
  }

  async updateOnlineRolesWithNewValues(roles: string[]): Promise<void> {
    const previousRoles = this.onlineRoles

    const userRolesChanged =
      roles.some((role) => !this.onlineRoles.includes(role)) || this.onlineRoles.some((role) => !roles.includes(role))

    if (!userRolesChanged) {
      return
    }

    this.setOnlineRoles(roles)

    const isInitialLoadRolesChange = previousRoles.length === 0
    if (!isInitialLoadRolesChange) {
      if (this.onlineRolesIncludePaidSubscription()) {
        await this.notifyEvent(FeaturesEvent.DidPurchaseSubscription)
      }
    }
  }

  setOnlineRoles(roles: string[]): void {
    const rolesChanged = !arraysEqual(this.onlineRoles, roles)

    this.onlineRoles = roles

    if (rolesChanged) {
      void this.notifyEvent(FeaturesEvent.UserRolesChanged)
    }

    this.storage.setValue(StorageKey.UserRoles, this.onlineRoles)
  }

  setOfflineRoles(roles: string[]): void {
    const rolesChanged = !arraysEqual(this.offlineRoles, roles)

    this.offlineRoles = roles

    if (rolesChanged) {
      void this.notifyEvent(FeaturesEvent.UserRolesChanged)
    }

    this.storage.setValue(StorageKey.OfflineUserRoles, this.offlineRoles)
  }

  public isThirdPartyFeature(identifier: string): boolean {
    const isNativeFeature = !!FindNativeFeature(identifier as FeatureIdentifier)
    return !isNativeFeature
  }

  onlineRolesIncludePaidSubscription(): boolean {
    const unpaidRoles = [RoleName.NAMES.CoreUser]
    return this.onlineRoles.some((role) => !unpaidRoles.includes(role))
  }

  public rolesBySorting(roles: string[]): string[] {
    return Object.values(RoleName.NAMES).filter((role) => roles.includes(role))
  }

  public hasMinimumRole(role: string): boolean {
    const sortedAllRoles = Object.values(RoleName.NAMES)

    const sortedUserRoles = this.rolesBySorting(
      this.hasFirstPartyOnlineSubscription() ? this.onlineRoles : this.offlineRoles,
    )

    const highestUserRoleIndex = sortedAllRoles.indexOf(lastElement(sortedUserRoles) as string)

    const indexOfRoleToCheck = sortedAllRoles.indexOf(role)

    return indexOfRoleToCheck <= highestUserRoleIndex
  }

  public getFeatureStatus(
    featureId: FeatureIdentifier,
    options: { inContextOfItem?: DecryptedItemInterface } = {},
  ): FeatureStatus {
    return this.getFeatureStatusUseCase.execute({
      featureId,
      firstPartyRoles: this.hasFirstPartyOnlineSubscription()
        ? { online: this.onlineRoles }
        : this.hasFirstPartyOfflineSubscription()
        ? { offline: this.offlineRoles }
        : undefined,
      hasPaidAnyPartyOnlineOrOfflineSubscription: this.hasPaidAnyPartyOnlineOrOfflineSubscription(),
      firstPartyOnlineSubscription: this.hasFirstPartyOnlineSubscription()
        ? this.subscriptions.getOnlineSubscription()
        : undefined,
      inContextOfItem: options.inContextOfItem,
    })
  }

  public async downloadRemoteThirdPartyFeature(urlOrCode: string): Promise<ComponentInterface | undefined> {
    let url = urlOrCode
    try {
      url = this.crypto.base64Decode(urlOrCode)
    } catch (err) {
      void err
    }

    try {
      const trustedCustomExtensionsUrls = [...TRUSTED_FEATURE_HOSTS, ...TRUSTED_CUSTOM_EXTENSIONS_HOSTS]
      const { host } = new URL(url)

      const usecase = new DownloadRemoteThirdPartyFeatureUseCase(this.api, this.items, this.alerts)

      if (!trustedCustomExtensionsUrls.includes(host)) {
        const didConfirm = await this.alerts.confirm(
          API_MESSAGE_UNTRUSTED_EXTENSIONS_WARNING,
          'Install extension from an untrusted source?',
          'Proceed to install',
          ButtonType.Danger,
          'Cancel',
        )
        if (didConfirm) {
          return usecase.execute(url)
        }
      } else {
        return usecase.execute(url)
      }
    } catch (err) {
      void this.alerts.alert(INVALID_EXTENSION_URL)
    }

    return undefined
  }

  override deinit(): void {
    super.deinit()
    ;(this.onlineRoles as unknown) = undefined
    ;(this.offlineRoles as unknown) = undefined
    ;(this.storage as unknown) = undefined
    ;(this.items as unknown) = undefined
    ;(this.mutator as unknown) = undefined
    ;(this.api as unknown) = undefined
    ;(this.subscriptions as unknown) = undefined
    ;(this.settings as unknown) = undefined
    ;(this.user as unknown) = undefined
    ;(this.sync as unknown) = undefined
    ;(this.alerts as unknown) = undefined
    ;(this.sessions as unknown) = undefined
    ;(this.crypto as unknown) = undefined
  }
}
