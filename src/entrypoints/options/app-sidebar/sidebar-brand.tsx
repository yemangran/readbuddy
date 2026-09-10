import readFrogLogo from "@/assets/icons/read-frog.png"
import { i18n } from "@/utils/i18n"

export function SidebarBrandHeader() {
  const appName = i18n.t("name")
  const settingsLabel = i18n.t("options.sidebar.settings")

  return (
    <div className="flex items-center gap-3 px-2 py-2 select-none">
      <img src={readFrogLogo} alt={appName} className="size-7 shrink-0 rounded-md object-contain" />
      <div className="flex min-w-0 flex-col group-data-[state=collapsed]:hidden">
        <span className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
          {appName}
        </span>
        <span className="truncate text-[11px] text-muted-foreground">{settingsLabel}</span>
      </div>
    </div>
  )
}
