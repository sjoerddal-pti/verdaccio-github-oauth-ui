import { logger } from "../../logger"
import { AuthProvider } from "./AuthProvider"

/**
 * When installing packages, the CLI makes a burst of package requests.
 *
 * If we were to perform a full authentication check and fetch the provider groups
 * on each package request, this would slow down the process a lot and we would
 * likely hit a request limit with the auth provider.
 *
 * Therefore the groups of a user are fetched once and cached for a short
 * period. Requests that arrive while the groups are being fetched share that
 * one lookup, and a failed lookup is not cached.
 */
export class Cache {
  private readonly cache = new Map<
    string,
    { value: string[]; expire: number }
  >()
  private readonly pending = new Map<string, Promise<string[]>>()
  private readonly authProvider: AuthProvider
  private readonly cacheTTLms: number

  constructor(
    authProvider: AuthProvider,
    cacheTTLms = 10_000, // 10s
  ) {
    this.authProvider = authProvider
    this.cacheTTLms = cacheTTLms
  }

  async getGroups(userName: string): Promise<string[]> {
    try {
      const providerId = this.authProvider.getId()
      const key = `${providerId}/${userName}`

      const hit = this.cache.get(key)
      if (hit && hit.expire >= Date.now()) {
        return hit.value
      }

      let lookup = this.pending.get(key)
      if (!lookup) {
        lookup = this.fetchGroups(key, userName)
        this.pending.set(key, lookup)
      }
      return await lookup
    } catch (error) {
      logger.error(error)
      return []
    }
  }

  private async fetchGroups(key: string, userName: string): Promise<string[]> {
    try {
      const groups = (await this.authProvider.getGroups(userName)) || []
      this.cache.set(key, {
        value: groups,
        expire: Date.now() + this.cacheTTLms,
      })
      return groups
    } finally {
      this.pending.delete(key)
    }
  }
}
