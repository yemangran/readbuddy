import { Icon } from "@iconify/react"
import { useState } from "react"
import { Badge } from "@/components/ui/base-ui/badge"
import { Button } from "@/components/ui/base-ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/base-ui/dialog"
import { toastManager } from "@/components/ui/base-ui/toast"
import { i18n } from "@/utils/i18n"
import { cn } from "@/utils/styles/utils"

export interface WebdavVendorGuide {
  id: string
  name: string
  tabName?: string
  tag: string
  icon: string
  description: string
  endpointExample: string
  defaultEndpoint?: string
  websiteUrl?: string
  websiteLabel?: string
  steps: string[]
  tips: string[]
}

interface VendorConfig {
  id: "jianguoyun" | "nextcloud" | "infinicloud" | "synology" | "generic"
  icon: string
  endpointExample: string
  defaultEndpoint?: string
  websiteUrl?: string
  stepCount: number
  tipCount: number
}

const VENDOR_CONFIGS: VendorConfig[] = [
  {
    id: "jianguoyun",
    icon: "tabler:cloud",
    endpointExample: "https://dav.jianguoyun.com/dav/",
    defaultEndpoint: "https://dav.jianguoyun.com/dav/",
    websiteUrl: "https://www.jianguoyun.com/d/home#/account/security",
    stepCount: 5,
    tipCount: 2,
  },
  {
    id: "nextcloud",
    icon: "tabler:server",
    endpointExample: "https://your-domain.com/remote.php/dav/files/USERNAME/",
    defaultEndpoint: "https://your-domain.com/remote.php/dav/files/USERNAME/",
    websiteUrl: "https://docs.nextcloud.com/server/latest/user_manual/en/files/access_webdav.html",
    stepCount: 5,
    tipCount: 2,
  },
  {
    id: "infinicloud",
    icon: "tabler:cloud-computing",
    endpointExample: "https://YOUR_ID.teracloud.jp/dav/",
    defaultEndpoint: "https://YOUR_ID.teracloud.jp/dav/",
    websiteUrl: "https://infini-cloud.net",
    stepCount: 5,
    tipCount: 2,
  },
  {
    id: "synology",
    icon: "tabler:device-desktop-analytics",
    endpointExample: "https://your-nas-domain:5006/home/",
    defaultEndpoint: "https://your-nas-domain:5006/home/",
    websiteUrl: "https://www.synology.com",
    stepCount: 5,
    tipCount: 2,
  },
  {
    id: "generic",
    icon: "tabler:plug",
    endpointExample: "https://your-server.com/dav/",
    defaultEndpoint: "https://your-server.com/dav/",
    websiteUrl: "https://alist.nn.ci/zh/guide/webdav.html",
    stepCount: 4,
    tipCount: 2,
  },
]

export function getWebdavVendors(): WebdavVendorGuide[] {
  return VENDOR_CONFIGS.map((config) => {
    const steps: string[] = []
    for (let i = 1; i <= config.stepCount; i++) {
      steps.push(i18n.t(`options.dictionary.webdav.vendors.${config.id}.step${i}` as any))
    }
    const tips: string[] = []
    for (let i = 1; i <= config.tipCount; i++) {
      tips.push(i18n.t(`options.dictionary.webdav.vendors.${config.id}.tip${i}` as any))
    }

    return {
      id: config.id,
      name: i18n.t(`options.dictionary.webdav.vendors.${config.id}.name` as any),
      tabName: i18n.t(`options.dictionary.webdav.vendors.${config.id}.tabName` as any),
      tag: i18n.t(`options.dictionary.webdav.vendors.${config.id}.tag` as any),
      icon: config.icon,
      description: i18n.t(`options.dictionary.webdav.vendors.${config.id}.description` as any),
      endpointExample: config.endpointExample,
      defaultEndpoint: config.defaultEndpoint,
      websiteUrl: config.websiteUrl,
      websiteLabel: i18n.t(`options.dictionary.webdav.vendors.${config.id}.websiteLabel` as any),
      steps,
      tips,
    }
  })
}

interface WebdavSetupGuideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WebdavSetupGuideDialog({ open, onOpenChange }: WebdavSetupGuideDialogProps) {
  const [selectedVendorId, setSelectedVendorId] = useState<string>("jianguoyun")
  const vendors = getWebdavVendors()
  const currentVendor: WebdavVendorGuide =
    vendors.find((v) => v.id === selectedVendorId) ?? vendors[0]!

  const handleCopyEndpoint = (text: string) => {
    void navigator.clipboard.writeText(text)
    toastManager.add({
      type: "success",
      title: i18n.t("options.dictionary.webdav.endpointCopied"),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[620px] max-h-[88vh] max-w-4xl flex-col overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="flex-shrink-0 border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Icon icon="tabler:book-2" className="size-5 text-primary" />
              {i18n.t("options.dictionary.webdav.setupGuideTitle")}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {i18n.t("options.dictionary.webdav.setupGuideDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* 左侧厂商导航 Tabs */}
          <div className="w-56 shrink-0 space-y-1 overflow-y-auto border-r bg-muted/20 p-2.5">
            <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">
              {i18n.t("options.dictionary.webdav.supportedVendors")}
            </div>
            {vendors.map((vendor) => {
              const isSelected = vendor.id === selectedVendorId
              return (
                <button
                  key={vendor.id}
                  type="button"
                  onClick={() => setSelectedVendorId(vendor.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs transition-all",
                    isSelected
                      ? "border border-border/80 bg-background font-medium text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Icon
                      icon={vendor.icon}
                      className={cn(
                        "size-4 shrink-0",
                        isSelected ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <span className="truncate">{vendor.tabName || vendor.name.split(" ")[0]}</span>
                  </div>
                  {vendor.tag && (
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[10px]",
                        isSelected
                          ? "bg-primary/10 font-medium text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {vendor.tag}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* 右侧对应厂商详细指南 */}
          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            {/* 厂商头部介绍 */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-1">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Icon icon={currentVendor.icon} className="size-5 text-primary" />
                  <h3 className="text-base font-semibold text-foreground">{currentVendor.name}</h3>
                  <Badge variant="outline" className="text-[11px]">
                    {currentVendor.tag}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{currentVendor.description}</p>
              </div>

              {currentVendor.websiteUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="h-7 text-xs"
                  onClick={() => window.open(currentVendor.websiteUrl, "_blank")}
                >
                  <Icon icon="tabler:external-link" className="mr-1 size-3.5" />
                  {currentVendor.websiteLabel || i18n.t("options.dictionary.webdav.visitWebsite")}
                </Button>
              )}
            </div>

            {/* 端点地址示例与一键填入 */}
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  {i18n.t("options.dictionary.webdav.endpointFormat")}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="h-6 text-[11px]"
                    onClick={() => handleCopyEndpoint(currentVendor.endpointExample)}
                  >
                    <Icon icon="tabler:copy" className="mr-1 size-3" />
                    {i18n.t("options.dictionary.webdav.copyEndpoint")}
                  </Button>
                </div>
              </div>
              <code className="block rounded bg-background px-2.5 py-1.5 font-mono text-xs text-primary selection:bg-primary/20">
                {currentVendor.endpointExample}
              </code>
            </div>

            {/* 接入步骤 */}
            <div className="space-y-2.5">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Icon icon="tabler:list-numbers" className="size-4 text-primary" />
                {i18n.t("options.dictionary.webdav.setupSteps")}
              </h4>
              <div className="space-y-2 text-xs">
                {currentVendor.steps.map((step, idx) => (
                  <div key={step} className="flex items-start gap-2.5">
                    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed text-foreground/90">{step}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 避坑提示 */}
            {currentVendor.tips.length > 0 && (
              <div className="space-y-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs">
                <div className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                  <Icon icon="tabler:alert-triangle" className="size-4" />
                  {i18n.t("options.dictionary.webdav.notesAndTips")}
                </div>
                <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                  {currentVendor.tips.map((tip) => (
                    <li key={tip} className="leading-relaxed">
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex flex-row items-center justify-between border-t bg-muted/10 px-6 py-3 sm:justify-between">
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Icon icon="tabler:info-circle" className="size-3.5 text-primary" />
            {i18n.t("options.dictionary.webdav.verifyConnectionTip")}
          </div>
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            {i18n.t("options.dictionary.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
