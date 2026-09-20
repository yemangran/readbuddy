import type { APIProviderTypes } from "@/types/config/provider"
import ProviderIcon from "@/components/provider-icon"
import { useTheme } from "@/components/providers/theme-provider"
import { PROVIDER_ITEMS, getProviderItemName } from "@/utils/constants/providers"

export function ConfigHeader({ providerType }: { providerType: APIProviderTypes }) {
  const { theme } = useTheme()
  const providerItem = PROVIDER_ITEMS[providerType]
  const providerWebsiteUrl = providerItem.website

  const icon = (
    <ProviderIcon
      logo={providerItem.logo(theme)}
      name={getProviderItemName(providerType)}
      size="base"
      className="group hover:cursor-pointer"
      textClassName="font-medium group-hover:text-link"
    />
  )

  return (
    <div className="flex items-start justify-between">
      {providerWebsiteUrl ? (
        <a
          href={providerWebsiteUrl}
          className="flex items-center gap-2"
          target="_blank"
          rel="noreferrer"
        >
          {icon}
        </a>
      ) : (
        icon
      )}
    </div>
  )
}
