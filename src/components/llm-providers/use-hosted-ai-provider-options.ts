import type { ProviderSelectorOption } from "@/utils/providers/provider-display"
import type { ProviderCapability } from "@/utils/providers/provider-registry"

export function useHostedAiProviderOptions(
  _capability: ProviderCapability,
  providers: ProviderSelectorOption[],
): ProviderSelectorOption[] {
  return providers
}
