/**
 * Extract error message from API response
 * Handles various error formats: JSON string, { error: { message } }, { message }, plain text
 */
export async function extractErrorMessage(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`
  const text = await response.text()

  if (!text) return fallback

  try {
    const json = JSON.parse(text)
    if (typeof json === "string") return json
    if (json.error?.message) return json.error.message
    if (json.message) return json.message
    return fallback
  } catch {
    return text.slice(0, 100)
  }
}

function getNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function cleanSDKErrorPrefix(message: string | undefined): string | undefined {
  if (!message) return undefined
  let cleaned = message.trim()
  cleaned = cleaned.replace(/^Failed after \d+ attempts\.\s*Last error:\s*/i, "")
  cleaned = cleaned.replace(/^(?:AI_)?APICallError:\s*/i, "")
  return cleaned.trim() || undefined
}

function tryExtractJsonErrorMessage(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    if (typeof parsed === "string") return parsed
    if (parsed && typeof parsed === "object") {
      const err = parsed as { error?: { message?: unknown }; message?: unknown }
      if (typeof err.error?.message === "string" && err.error.message.trim().length > 0) {
        return err.error.message.trim()
      }
      if (typeof err.message === "string" && err.message.trim().length > 0) {
        return err.message.trim()
      }
    }
  } catch {
    // Not JSON
  }
  return undefined
}

export function extractAISDKErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    const parsed = tryExtractJsonErrorMessage(error)
    return cleanSDKErrorPrefix(parsed ?? error) ?? error
  }

  if (typeof error === "object" && error !== null) {
    const source = error as {
      message?: unknown
      responseBody?: unknown
      text?: unknown
    }

    const rawMessage = getNonEmptyString(source.message)
    const cleanedMessage = cleanSDKErrorPrefix(rawMessage)
    const message = tryExtractJsonErrorMessage(cleanedMessage) ?? cleanedMessage
    const responseBody = getNonEmptyString(source.responseBody)
    const text = getNonEmptyString(source.text)

    if (isGenericAISDKErrorMessage(rawMessage)) {
      return responseBody ?? text ?? message ?? "Unexpected error occurred"
    }

    return message ?? responseBody ?? text ?? "Unexpected error occurred"
  }

  return "Unexpected error occurred"
}

function isGenericAISDKErrorMessage(message: string | undefined): boolean {
  if (!message) {
    return true
  }

  const normalizedMessage = message.trim().toLowerCase()
  return (
    normalizedMessage === "something went wrong" ||
    normalizedMessage === "unexpected error occurred"
  )
}
