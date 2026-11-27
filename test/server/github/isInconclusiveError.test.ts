import { isInconclusiveError } from "src/server/github/Client"
import { describe, expect, it } from "bun:test"

function httpError(
  status: number,
  headers: Record<string, string> = {},
  message = "error",
) {
  return Object.assign(new Error(message), { status, response: { headers } })
}

describe("isInconclusiveError", () => {
  it("treats 404 as a conclusive answer", () => {
    expect(isInconclusiveError(httpError(404))).toBe(false)
  })

  it("treats a plain 403 as a conclusive answer", () => {
    expect(isInconclusiveError(httpError(403))).toBe(false)
  })

  it("treats rate limit responses as inconclusive", () => {
    expect(isInconclusiveError(httpError(429))).toBe(true)
    expect(
      isInconclusiveError(httpError(403, { "x-ratelimit-remaining": "0" })),
    ).toBe(true)
    expect(isInconclusiveError(httpError(403, { "retry-after": "60" }))).toBe(
      true,
    )
    expect(
      isInconclusiveError(
        httpError(403, {}, "You have exceeded a secondary rate limit"),
      ),
    ).toBe(true)
  })

  it("treats server errors as inconclusive", () => {
    expect(isInconclusiveError(httpError(502))).toBe(true)
  })

  it("treats errors without a response as inconclusive", () => {
    expect(isInconclusiveError(new Error("fetch failed"))).toBe(true)
  })
})
