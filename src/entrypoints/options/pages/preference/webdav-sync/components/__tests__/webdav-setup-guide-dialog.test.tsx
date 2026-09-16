// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { i18n } from "@/utils/i18n"
import { WebdavSetupGuideDialog } from "../webdav-setup-guide-dialog"

describe("WebdavSetupGuideDialog", () => {
  it("renders multi-vendor tabs and shows Jianguoyun by default", () => {
    render(<WebdavSetupGuideDialog open={true} onOpenChange={vi.fn<(open: boolean) => void>()} />)

    // Check dialog header
    expect(
      screen.getByText(i18n.t("options.dictionary.webdav.setupGuideTitle")),
    ).toBeInTheDocument()

    // Check vendor tabs on the left
    expect(screen.getByText("坚果云")).toBeInTheDocument()
    expect(screen.getByText("Nextcloud")).toBeInTheDocument()
    expect(screen.getByText("InfiniCLOUD")).toBeInTheDocument()
    expect(screen.getByText("群晖")).toBeInTheDocument()
    expect(screen.getByText("通用")).toBeInTheDocument()

    // Default active content is Jianguoyun
    expect(screen.getByText("坚果云 (Jianguoyun)")).toBeInTheDocument()
    expect(screen.getByText("https://dav.jianguoyun.com/dav/")).toBeInTheDocument()
    expect(screen.getByText(/第三方应用管理/)).toBeInTheDocument()
  })

  it("switches vendor tutorial when clicking a vendor tab", () => {
    render(<WebdavSetupGuideDialog open={true} onOpenChange={vi.fn<(open: boolean) => void>()} />)

    // Click Nextcloud tab
    const nextcloudTab = screen.getByText("Nextcloud")
    fireEvent.click(nextcloudTab)

    // Nextcloud content should appear
    expect(screen.getByText("Nextcloud / ownCloud")).toBeInTheDocument()
    expect(screen.getByText(/设备与会话/)).toBeInTheDocument()

    // Click Synology tab
    const synologyTab = screen.getByText("群晖")
    fireEvent.click(synologyTab)

    // Synology content should appear
    expect(screen.getByText("群晖 NAS (Synology)")).toBeInTheDocument()
    expect(screen.getByText(/启用 HTTPS \(端口 5006\)/)).toBeInTheDocument()
  })

  it("triggers onApplyPreset and closes modal when clicking apply endpoint", () => {
    const onApplyPreset = vi.fn<(endpoint: string) => void>()
    const onOpenChange = vi.fn<(open: boolean) => void>()

    render(
      <WebdavSetupGuideDialog
        open={true}
        onOpenChange={onOpenChange}
        onApplyPreset={onApplyPreset}
        canApplyPreset={true}
      />,
    )

    const applyBtn = screen.getByText("一键填入端点")
    fireEvent.click(applyBtn)

    expect(onApplyPreset).toHaveBeenCalledWith("https://dav.jianguoyun.com/dav/")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
