import type { APIProviderTypes } from "@/types/config/provider"
import ProviderIcon from "@/components/provider-icon"
import { useTheme } from "@/components/providers/theme-provider"
import { GITHUB_REPO_URL } from "@/utils/constants/app"
import { PROVIDER_ITEMS, getProviderItemName } from "@/utils/constants/providers"
import { i18n } from "@/utils/i18n"

export function ConfigHeader({ providerType }: { providerType: APIProviderTypes }) {
  const { theme } = useTheme()
  const providerItem = PROVIDER_ITEMS[providerType]
  const providerWebsiteUrl = providerItem.website
  const tutorialUrl = `${GITHUB_REPO_URL}#readme`

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
      <a
        href={tutorialUrl}
        className="text-xs text-link hover:opacity-90"
        target="_blank"
        rel="noreferrer"
      >
        {i18n.t("options.apiProviders.howToConfigure")}
      </a>
    </div>
  )
}
