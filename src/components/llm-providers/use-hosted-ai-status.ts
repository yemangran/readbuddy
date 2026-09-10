import type { HostedAiStatus } from "@/utils/hosted-ai/types"

export interface HostedAiStatusResult {
  status: HostedAiStatus | undefined
  isSignedIn: boolean
  isPending: boolean
  isError: boolean
}

/**
 * Returns static hosted AI status for local-first operations.
 * Upstream network requests and session queries are completely decoupled.
 */
export function useHostedAiStatus(_options: { enabled?: boolean } = {}): HostedAiStatusResult {
  return {
    status: undefined,
    isSignedIn: false,
    isPending: false,
    isError: false,
  }
}
