import readFrogLogo from "@/assets/icons/read-frog.png"
import { i18n } from "@/utils/i18n"

export function PopupBrandHeader() {
  const appName = i18n.t("name")

  return (
    <div className="flex items-center gap-2 select-none">
      <img src={readFrogLogo} alt={appName} className="size-6 shrink-0 rounded-md object-contain" />
      <span className="truncate text-sm font-semibold tracking-tight text-foreground">
        {appName}
      </span>
    </div>
  )
}
