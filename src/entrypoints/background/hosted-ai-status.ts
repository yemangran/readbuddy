import { onMessage } from "@/utils/message"

export async function clearHostedAiStatusCache(): Promise<void> {
  // No-op: hosted AI status is decoupled
}

export function setupHostedAiStatusHandler(): void {
  onMessage("getHostedAiStatus", async () => {
    return null
  })
}
