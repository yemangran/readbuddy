import type { PromptableProviderRef } from "@/utils/providers/provider-ref"

export type BackgroundGenerateTextPayload = {
  providerRef: PromptableProviderRef
  instructions: string
  prompt: string
  /** Local providers only; retries are the caller's business. */
  maxRetries?: number
}

export interface BackgroundGenerateTextResponse {
  text: string
}
