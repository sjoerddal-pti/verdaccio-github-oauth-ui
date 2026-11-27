import { AuthProvider } from "src/server/plugin/AuthProvider"
import { Cache } from "src/server/plugin/Cache"
import {
  createTestAuthProvider,
  testErrorMessage,
  testOAuthToken,
} from "test/utils"
import timekeeper from "timekeeper"
import { describe, expect, it, mock, spyOn } from "bun:test"

describe("Cache", () => {
  describe("getGroups", () => {
    const cacheTTLms = 200
    let provider: AuthProvider
    let cache: Cache

    function configureSucceedingProvider(
      getGroups: (token: string) => string[],
    ) {
      provider = createTestAuthProvider()
      provider.getGroups = mock((token) => Promise.resolve(getGroups(token)))
      cache = new Cache(provider, cacheTTLms)
    }

    function configureFailingProvider() {
      provider = createTestAuthProvider()
      spyOn(provider, "getGroups").mockRejectedValue(
        new Error(testErrorMessage),
      )
      cache = new Cache(provider, cacheTTLms)
    }

    it("fetches groups from the provider", async () => {
      const expectedGroups = ["some-group"]
      configureSucceedingProvider(() => expectedGroups)

      const groups = await cache.getGroups(testOAuthToken)

      expect(provider.getGroups).toHaveBeenCalledWith(testOAuthToken)
      expect(groups).toEqual(expectedGroups)
    })

    it("caches groups", async () => {
      configureSucceedingProvider(() => [])

      await cache.getGroups(testOAuthToken)
      await cache.getGroups(testOAuthToken)

      expect(provider.getGroups).toHaveBeenCalledTimes(1)
    })

    it("invalidates cached groups after its ttl passed", async () => {
      configureSucceedingProvider(() => [])

      const timeFirstCall = new Date("2021-11-27T00:00:00.000Z")
      timekeeper.freeze(timeFirstCall)

      await cache.getGroups(testOAuthToken)

      // multiply by 1.5 to avoid flake
      const timeSecondCall = new Date(
        `2021-11-27T00:00:00.${cacheTTLms * 1.5}Z`,
      )
      timekeeper.travel(timeSecondCall)

      await cache.getGroups(testOAuthToken)

      timekeeper.reset()

      expect(provider.getGroups).toHaveBeenCalledTimes(2)
    })

    it("automatically extends the cache ttl on access", async () => {
      configureSucceedingProvider(() => [])

      timekeeper.freeze(new Date())

      for (let i = 0; i < 5; i++) {
        const time = new Date(`2021-11-27T00:00:00.${cacheTTLms * 0.5 * i}Z`)
        timekeeper.travel(time)
        await cache.getGroups(testOAuthToken)
      }

      timekeeper.reset()

      // iteration 0: 2021-11-27T00:00:00.000 -> nothing in the cache -> call service
      // iteration 1: 2021-11-27T00:00:00.100 -> cache hit
      // iteration 2: 2021-11-27T00:00:00.200 -> cache hit
      // iteration 3: 2021-11-27T00:00:00.300 -> cache expired -> call service
      // iteration 4: 2021-11-27T00:00:00.400 -> cache hit
      expect(provider.getGroups).toHaveBeenCalledTimes(2)
    })

    it("returns empty groups when an error occurs", async () => {
      configureFailingProvider()

      const groups = await cache.getGroups(testOAuthToken)

      expect(groups).toEqual([])
    })

    it("does not cache a failed lookup", async () => {
      configureFailingProvider()

      await cache.getGroups(testOAuthToken)
      await cache.getGroups(testOAuthToken)

      expect(provider.getGroups).toHaveBeenCalledTimes(2)
    })

    it("shares one lookup between concurrent requests", async () => {
      const expectedGroups = ["some-group"]
      const { promise, resolve } = Promise.withResolvers<string[]>()
      provider = createTestAuthProvider()
      provider.getGroups = mock(() => promise)
      cache = new Cache(provider, cacheTTLms)

      const requests = [1, 2, 3].map(() => cache.getGroups(testOAuthToken))
      resolve(expectedGroups)
      const results = await Promise.all(requests)

      expect(provider.getGroups).toHaveBeenCalledTimes(1)
      expect(results).toEqual([expectedGroups, expectedGroups, expectedGroups])
    })

    it("looks up again after a shared lookup failed", async () => {
      provider = createTestAuthProvider()
      provider.getGroups = mock()
        .mockRejectedValueOnce(new Error(testErrorMessage))
        .mockResolvedValueOnce(["some-group"])
      cache = new Cache(provider, cacheTTLms)

      const failed = await Promise.all([
        cache.getGroups(testOAuthToken),
        cache.getGroups(testOAuthToken),
      ])
      const groups = await cache.getGroups(testOAuthToken)

      expect(failed).toEqual([[], []])
      expect(groups).toEqual(["some-group"])
      expect(provider.getGroups).toHaveBeenCalledTimes(2)
    })

    it("distinguishes between different tokens", async () => {
      configureSucceedingProvider((token) => [token])

      const aGroups = await cache.getGroups("goat")
      const bGroups = await cache.getGroups("cheese")

      expect(provider.getGroups).toHaveBeenCalledTimes(2)
      expect(aGroups).toEqual(["goat"])
      expect(bGroups).toEqual(["cheese"])
    })
  })
})
