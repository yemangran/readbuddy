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

const WEBDAV_VENDORS: WebdavVendorGuide[] = [
  {
    id: "jianguoyun",
    name: "坚果云 (Jianguoyun)",
    tag: "国内推荐",
    icon: "tabler:cloud",
    description: "国内网络访问稳定、开箱即用，支持多设备全自动云同步。",
    endpointExample: "https://dav.jianguoyun.com/dav/",
    defaultEndpoint: "https://dav.jianguoyun.com/dav/",
    websiteUrl: "https://www.jianguoyun.com/d/home#/account/security",
    websiteLabel: "前往坚果云安全设置页面",
    steps: [
      "登录坚果云网页版官网 (jianguoyun.com)。",
      "点击右上角账号进入「账户信息」➜「安全选项」。",
      "找到「第三方应用管理」，点击「添加应用密码」，应用名称填写「伴读书童」或「Read Buddy」。",
      "在坚果云用户根目录（「我的文件」）中手动创建一个名为「readbuddy」的文件夹（重要：用户需要在坚果云用户根目录中手动创建一个 readbuddy 的目录才可以正常进行同步）。",
      "将注册邮箱填入插件「用户名」，生成的应用授权密码填入「密码」，服务地址填入「https://dav.jianguoyun.com/dav/」。",
    ],
    tips: [
      "必须使用坚果云生成的「应用授权密码」，不能使用普通的网页登录密码。",
      "【必须手动创建目录】用户需要在坚果云用户根目录中手动创建一个「readbuddy」的目录才可以正常进行同步（坚果云根目录不支持直接放置文件，也不允许客户端通过接口直接创建根文件夹）。",
    ],
  },
  {
    id: "nextcloud",
    name: "Nextcloud / ownCloud",
    tag: "开源私有云",
    icon: "tabler:server",
    description: "主流开源私有云盘，数据完全自主可控，原生提供标准 WebDAV 接口。",
    endpointExample: "https://<你的域名>/remote.php/dav/files/<用户名>/",
    defaultEndpoint: "https://your-domain.com/remote.php/dav/files/USERNAME/",
    websiteUrl: "https://docs.nextcloud.com/server/latest/user_manual/en/files/access_webdav.html",
    websiteLabel: "查看 Nextcloud WebDAV 文档",
    steps: [
      "登录您的 Nextcloud / ownCloud 网页端后台。",
      "点击右上角个人头像 ➜ 进入「个人设置 (Personal settings)」➜「安全 (Security)」。",
      "在底部「设备与会话 (Devices & credentials)」中，输入应用名称「Read Buddy」，点击「创建新的应用密码」。",
      "复制生成的专用应用密码，服务地址填写 Nextcloud「文件设置」左下角展示的 WebDAV 完整地址。",
      "将 Nextcloud 用户名和专用应用密码填入插件完成配置。",
    ],
    tips: [
      "若开启了二次身份验证 (2FA)，必须生成并使用「应用专用密码」。",
      "请确保您的 Nextcloud 域名配置了有效的 HTTPS 证书并允许来自浏览器的请求。",
    ],
  },
  {
    id: "infinicloud",
    name: "InfiniCLOUD",
    tag: "海外免梯",
    icon: "tabler:cloud-computing",
    description: "日本老牌云存储 (原 TeraCLOUD)，原生提供免费容量与高速稳定的 WebDAV 服务。",
    endpointExample: "https://<你的ID>.teracloud.jp/dav/",
    defaultEndpoint: "https://YOUR_ID.teracloud.jp/dav/",
    websiteUrl: "https://infini-cloud.net",
    websiteLabel: "前往 InfiniCLOUD 个人中心",
    steps: [
      "登录 InfiniCLOUD 官网并在个人控制面板 (My Page) 中找到「Apps Connection」。",
      "勾选开启「Apps Connection」选项。",
      "系统将为您分配专属的 WebDAV Connection URL (形如 https://<ID>.teracloud.jp/dav/)。",
      "勾选「Issue / Re-issue」获取专属 Connection Password (连接密码)。",
      "将分配的 URL 填入「服务地址」，用户 ID 填入「用户名」，Connection Password 填入「密码」。",
    ],
    tips: [
      "请妥善保存生成的 Connection Password，该密码独立于官网网页登录密码。",
      "适合经常在多国网络环境切换、或希望与国内网盘隔离的用户。",
    ],
  },
  {
    id: "synology",
    name: "群晖 NAS (Synology)",
    tag: "家庭私有云",
    icon: "tabler:device-desktop-analytics",
    description: "在个人或家庭私有 NAS 上自建 WebDAV 同步服务，数据彻底本地私有化。",
    endpointExample: "https://<NAS域名或IP>:5006/<共享文件夹>/",
    defaultEndpoint: "https://your-nas-domain:5006/home/",
    websiteUrl: "https://www.synology.com",
    websiteLabel: "群晖官方支持中心",
    steps: [
      "登录群晖 DSM 系统，打开「套件中心」，搜索并安装「WebDAV Server」套件。",
      "打开 WebDAV Server 套件界面，勾选「启用 HTTPS (端口 5006)」并应用。",
      "在 DSM「控制面板」➜「权限 / 用户群组」中，确保当前同步用户已赋予 WebDAV Server 访问权限。",
      "服务地址填入「https://<NAS域名或IP>:5006/<共享目录>/」（如 https://nas.local:5006/home/）。",
      "填入 DSM 用户名与密码进行连接。",
    ],
    tips: [
      "强烈建议使用 HTTPS 端口 5006；如使用自签名证书，请确保浏览器或系统已信任该证书。",
      "公网环境下访问 NAS 请做好路由器的端口映射、DDNS 或反向代理设置。",
    ],
  },
  {
    id: "generic",
    name: "通用 WebDAV / Alist / 其它",
    tag: "标准协议",
    icon: "tabler:plug",
    description: "适用于 Alist、rclone、Apache/Nginx WebDAV 模块或任何遵循 RFC 4918 标准的服务端。",
    endpointExample: "https://your-server.com/dav/",
    defaultEndpoint: "https://your-server.com/dav/",
    websiteUrl: "https://alist.nn.ci/zh/guide/webdav.html",
    websiteLabel: "查看 Alist WebDAV 配置指南",
    steps: [
      "准备已正常部署并支持标准 HTTP WebDAV 协议的服务端。",
      "确认同步目标目录具备读写以及创建子目录 (GET, PUT, MKCOL) 权限。",
      "获取完整的 WebDAV 基础服务地址，填入插件的「服务地址」输入框。",
      "填入服务端的认证用户名与密码，点击「测试连接」验证连通性。",
    ],
    tips: [
      "服务端需支持 HTTP Basic 认证机制。",
      "为支持多设备并发同步防冲突，建议服务端支持条件请求头 (ETag 与 If-Match / If-None-Match)。",
    ],
  },
]

interface WebdavSetupGuideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WebdavSetupGuideDialog({ open, onOpenChange }: WebdavSetupGuideDialogProps) {
  const [selectedVendorId, setSelectedVendorId] = useState<string>("jianguoyun")

  const currentVendor: WebdavVendorGuide =
    WEBDAV_VENDORS.find((v) => v.id === selectedVendorId) ?? WEBDAV_VENDORS[0]!

  const handleCopyEndpoint = (text: string) => {
    void navigator.clipboard.writeText(text)
    toastManager.add({
      type: "success",
      title: "已复制端点地址到剪贴板",
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
            选择您所使用的 WebDAV 服务商，查看对应的服务地址格式、密码获取方式与接入配置教程。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* 左侧厂商导航 Tabs */}
          <div className="w-56 shrink-0 space-y-1 overflow-y-auto border-r bg-muted/20 p-2.5">
            <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">
              支持的 WebDAV 服务商
            </div>
            {WEBDAV_VENDORS.map((vendor) => {
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
                    <span className="truncate">{vendor.name.split(" ")[0]}</span>
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
                  {currentVendor.websiteLabel || "访问官网"}
                </Button>
              )}
            </div>

            {/* 端点地址示例与一键填入 */}
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  服务地址 (Endpoint) 格式：
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
                    复制地址
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
                配置接入步骤：
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
                  注意事项与避坑指南：
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
            配置完成后，建议点击页面中的「测试连接」验证连通性
          </div>
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            {i18n.t("options.dictionary.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
