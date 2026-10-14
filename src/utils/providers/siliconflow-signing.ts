import type { SiliconFlowAuthMode } from "@/types/config/provider"
import {
  SILICONFLOW_SPONSORED_CLIENT_NAME,
  SILICONFLOW_SPONSORED_SALT,
} from "@/utils/constants/providers"

export interface BuildSponsorClientHeadersOptions {
  allContent?: string
  sampleText?: string
  timestamp?: number | string
  salt?: string
}

/**
 * Resolves the effective authentication mode for SiliconFlow.
 *
 * Rules:
 * - If authMode is explicitly configured ("sponsored" or "byok"), respect that value.
 * - Otherwise (legacy configs or pre-update setups):
 *   - If apiKey is present and non-empty, resolve to "byok" to prevent breaking existing user setups.
 *   - Otherwise, resolve to "sponsored" out of the box.
 */
export function resolveSiliconFlowAuthMode(providerConfig: {
  apiKey?: string
  providerSpecificSettings?: { authMode?: SiliconFlowAuthMode }
}): SiliconFlowAuthMode {
  const explicitAuthMode = providerConfig.providerSpecificSettings?.authMode
  if (explicitAuthMode) {
    return explicitAuthMode
  }

  if (providerConfig.apiKey && providerConfig.apiKey.trim().length > 0) {
    return "byok"
  }

  return "sponsored"
}

/**
 * Generates SHA-256 signature using Web Crypto subtle digest.
 * Format matches Cloudflare Worker signature expectation:
 * `${timestamp}:${sampleText}:${salt}`
 */
export async function generateSponsorSignature(
  timestamp: number | string,
  sampleText: string,
  salt: string = SILICONFLOW_SPONSORED_SALT,
): Promise<string> {
  const message = `${timestamp}:${sampleText}:${salt}`
  const encoder = new TextEncoder()
  const data = encoder.encode(message)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Builds valid client verification headers for the sponsor gateway.
 * Headers include:
 * - X-Plugin-Client: read-buddy
 * - X-Timestamp: <timestamp>
 * - X-Signature: SHA-256(<timestamp>:<sampleText>:<salt>)
 */
export async function buildSponsorClientHeaders(
  optionsOrContent: BuildSponsorClientHeadersOptions | string = "",
  timestampArg?: number | string,
): Promise<Record<string, string>> {
  const options: BuildSponsorClientHeadersOptions =
    typeof optionsOrContent === "string"
      ? { allContent: optionsOrContent, timestamp: timestampArg }
      : optionsOrContent

  const timestamp = options.timestamp !== undefined ? options.timestamp : Date.now()
  const salt = options.salt ?? SILICONFLOW_SPONSORED_SALT
  const sampleText =
    options.sampleText !== undefined ? options.sampleText : (options.allContent ?? "").slice(0, 100)

  const signature = await generateSponsorSignature(timestamp, sampleText, salt)

  return {
    "X-Plugin-Client": SILICONFLOW_SPONSORED_CLIENT_NAME,
    "X-Timestamp": String(timestamp),
    "X-Signature": signature,
  }
}

/**
 * Extracts and concatenates text content from OpenAI chat messages.
 */
export function extractContentFromMessages(messages: unknown): string {
  if (!Array.isArray(messages)) return ""
  return messages
    .map((m) => {
      if (!m || typeof m !== "object") return ""
      const content = (m as { content?: unknown }).content
      if (typeof content === "string") return content
      if (Array.isArray(content)) {
        return content
          .map((part) =>
            part && typeof part === "object" && "text" in part && typeof part.text === "string"
              ? part.text
              : "",
          )
          .join("")
      }
      return ""
    })
    .join("\n")
}

/**
 * Creates custom fetch middleware for sponsored SiliconFlow calls.
 * Dynamically computes sampleText and client signature per request,
 * attaches required headers, and ensures client Authorization header is stripped.
 */
export function createSiliconFlowSponsorFetch(
  customFetch?: typeof fetch,
  salt?: string,
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let allContent = ""
    try {
      if (typeof init?.body === "string") {
        const body = JSON.parse(init.body) as { messages?: unknown }
        allContent = extractContentFromMessages(body?.messages)
      }
    } catch {
      // Body is not JSON or not string, ignore
    }

    const signedHeaders = await buildSponsorClientHeaders({ allContent, salt })
    const headers = new Headers(init?.headers)
    for (const [key, value] of Object.entries(signedHeaders)) {
      headers.set(key, value)
    }
    // Remove user API key if present
    headers.delete("Authorization")

    const fetchImpl = customFetch ?? globalThis.fetch
    return fetchImpl(input, {
      ...init,
      headers,
    })
  }
}
