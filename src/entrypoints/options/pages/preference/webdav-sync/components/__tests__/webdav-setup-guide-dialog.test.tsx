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
    expect(
      screen.getByText(i18n.t("options.dictionary.webdav.vendors.jianguoyun.tabName")),
    ).toBeInTheDocument()
    expect(
      screen.getByText(i18n.t("options.dictionary.webdav.vendors.nextcloud.tabName")),
    ).toBeInTheDocument()
    expect(
      screen.getByText(i18n.t("options.dictionary.webdav.vendors.infinicloud.tabName")),
    ).toBeInTheDocument()
    expect(
      screen.getByText(i18n.t("options.dictionary.webdav.vendors.synology.tabName")),
    ).toBeInTheDocument()
    expect(
      screen.getByText(i18n.t("options.dictionary.webdav.vendors.generic.tabName")),
    ).toBeInTheDocument()

    // Default active content is Jianguoyun
    expect(
      screen.getByText(i18n.t("options.dictionary.webdav.vendors.jianguoyun.name")),
    ).toBeInTheDocument()
    expect(screen.getByText("https://dav.jianguoyun.com/dav/")).toBeInTheDocument()
    expect(
      screen.getByText(i18n.t("options.dictionary.webdav.vendors.jianguoyun.step3")),
    ).toBeInTheDocument()
    expect(
      screen.getByText(i18n.t("options.dictionary.webdav.vendors.jianguoyun.step4")),
    ).toBeInTheDocument()
  })

  it("switches vendor tutorial when clicking a vendor tab", () => {
    render(<WebdavSetupGuideDialog open={true} onOpenChange={vi.fn<(open: boolean) => void>()} />)

    // Click Nextcloud tab
    const nextcloudTab = screen.getByText(
      i18n.t("options.dictionary.webdav.vendors.nextcloud.tabName"),
    )
    fireEvent.click(nextcloudTab)

    // Nextcloud content should appear
    expect(
      screen.getByText(i18n.t("options.dictionary.webdav.vendors.nextcloud.name")),
    ).toBeInTheDocument()
    expect(
      screen.getByText(i18n.t("options.dictionary.webdav.vendors.nextcloud.step3")),
    ).toBeInTheDocument()

    // Click Synology tab
    const synologyTab = screen.getByText(
      i18n.t("options.dictionary.webdav.vendors.synology.tabName"),
    )
    fireEvent.click(synologyTab)

    // Synology content should appear
    expect(
      screen.getByText(i18n.t("options.dictionary.webdav.vendors.synology.name")),
    ).toBeInTheDocument()
    expect(
      screen.getByText(i18n.t("options.dictionary.webdav.vendors.synology.step2")),
    ).toBeInTheDocument()
  })

  it("does not render apply preset button and provides copy address button", () => {
    const onOpenChange = vi.fn<(open: boolean) => void>()
    const writeTextMock = vi.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    })

    render(<WebdavSetupGuideDialog open={true} onOpenChange={onOpenChange} />)

    // "一键填入端点" button should no longer exist
    expect(screen.queryByText("一键填入端点")).not.toBeInTheDocument()

    // "复制地址" button should be available and clickable
    const copyBtn = screen.getByText(i18n.t("options.dictionary.webdav.copyEndpoint"))
    expect(copyBtn).toBeInTheDocument()
    fireEvent.click(copyBtn)
    expect(writeTextMock).toHaveBeenCalledWith("https://dav.jianguoyun.com/dav/")
  })
})
