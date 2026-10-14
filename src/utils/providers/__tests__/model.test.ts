import { beforeEach, describe, expect, it, vi } from "vitest"
import { storage } from "#imports"
import {
  FORCED_PROVIDER_HEADERS,
  SILICONFLOW_SPONSORED_GATEWAY_URL,
} from "@/utils/constants/providers"

let getStorageItemMock: ReturnType<typeof vi.fn>

const {
  anthropicLanguageModelMock,
  azureChatModelMock,
  azureLanguageModelMock,
  openAICompatibleLanguageModelMock,
  openResponsesLanguageModelMock,
  ollamaLanguageModelMock,
  createAnthropicMock,
  createAzureMock,
  createOllamaMock,
  createOpenAICompatibleMock,
  createOpenResponsesMock,
} = vi.hoisted(() => {
  const innerAnthropicLanguageModelMock = vi.fn<(...args: any[]) => any>()
  const innerAzureChatModelMock = vi.fn<(...args: any[]) => any>()
  const innerAzureLanguageModelMock = vi.fn<(...args: any[]) => any>()
  const innerOpenAICompatibleLanguageModelMock = vi.fn<(...args: any[]) => any>()
  const innerOpenResponsesLanguageModelMock = vi.fn<(...args: any[]) => any>()
  const innerOllamaLanguageModelMock = vi.fn<(...args: any[]) => any>()
  const innerCreateAnthropicMock = vi.fn<(...args: any[]) => any>(
    (_options?: Record<string, unknown>) => ({
      languageModel: innerAnthropicLanguageModelMock,
    }),
  )
  const innerCreateAzureMock = vi.fn<(...args: any[]) => any>(
    (_options?: Record<string, unknown>) => ({
      chat: innerAzureChatModelMock,
      languageModel: innerAzureLanguageModelMock,
    }),
  )
  const innerCreateOpenAICompatibleMock = vi.fn<(...args: any[]) => any>(
    (_options?: Record<string, unknown>) => ({
      languageModel: innerOpenAICompatibleLanguageModelMock,
    }),
  )
  const innerCreateOpenResponsesMock = vi.fn<(...args: any[]) => any>(
    (_options?: Record<string, unknown>) => ({
      languageModel: innerOpenResponsesLanguageModelMock,
    }),
  )
  const innerCreateOllamaMock = vi.fn<(...args: any[]) => any>(
    (_options?: Record<string, unknown>) => ({
      languageModel: innerOllamaLanguageModelMock,
    }),
  )

  return {
    anthropicLanguageModelMock: innerAnthropicLanguageModelMock,
    azureChatModelMock: innerAzureChatModelMock,
    azureLanguageModelMock: innerAzureLanguageModelMock,
    openAICompatibleLanguageModelMock: innerOpenAICompatibleLanguageModelMock,
    openResponsesLanguageModelMock: innerOpenResponsesLanguageModelMock,
    ollamaLanguageModelMock: innerOllamaLanguageModelMock,
    createAnthropicMock: innerCreateAnthropicMock,
    createAzureMock: innerCreateAzureMock,
    createOllamaMock: innerCreateOllamaMock,
    createOpenAICompatibleMock: innerCreateOpenAICompatibleMock,
    createOpenResponsesMock: innerCreateOpenResponsesMock,
  }
})

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: createAnthropicMock,
}))

vi.mock("@ai-sdk/azure", () => ({
  createAzure: createAzureMock,
}))

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: createOpenAICompatibleMock,
}))

vi.mock("@ai-sdk/open-responses", () => ({
  createOpenResponses: createOpenResponsesMock,
}))

vi.mock("ai-sdk-ollama", () => ({
  createOllama: createOllamaMock,
}))

function createAnthropicProviderConfig(headers?: Record<string, unknown>) {
  return {
    id: "anthropic-default",
    name: "Anthropic",
    enabled: true,
    provider: "anthropic",
    apiKey: "test-key",
    model: {
      model: "claude-haiku-4-5",
      isCustomModel: false,
      customModel: null,
    },
    ...(headers !== undefined && { headers }),
  }
}

function createOpenRouterProviderConfig(headers?: Record<string, unknown>) {
  return {
    id: "openrouter-default",
    name: "OpenRouter",
    enabled: true,
    provider: "openrouter",
    apiKey: "test-key",
    baseURL: "https://openrouter.ai/api/v1",
    model: {
      model: "x-ai/grok-4-fast:free",
      isCustomModel: false,
      customModel: null,
    },
    ...(headers !== undefined && { headers }),
  }
}

function createOllamaProviderConfig(providerOptions?: Record<string, unknown>) {
  return {
    id: "ollama-default",
    name: "Ollama",
    enabled: true,
    provider: "ollama",
    baseURL: "http://127.0.0.1:11434/",
    model: {
      model: "gemma3:4b",
      isCustomModel: false,
      customModel: null,
    },
    ...(providerOptions !== undefined && { providerOptions }),
  }
}

describe("getModelById", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    anthropicLanguageModelMock.mockReturnValue("anthropic-model")
    azureChatModelMock.mockReturnValue("azure-chat-model")
    azureLanguageModelMock.mockReturnValue("azure-model")
    openAICompatibleLanguageModelMock.mockReturnValue("custom-model")
    openResponsesLanguageModelMock.mockReturnValue("custom-responses-model")
    ollamaLanguageModelMock.mockReturnValue("ollama-model")
    getStorageItemMock = vi.fn<(...args: any[]) => any>()
    ;(storage.getItem as unknown as ReturnType<typeof vi.fn>) = getStorageItemMock
  })

  it("passes default headers for Anthropic when user headers are undefined", async () => {
    getStorageItemMock.mockResolvedValue({
      providersConfig: [createAnthropicProviderConfig()],
    })

    const { getModelById } = await import("../model")
    const result = await getModelById("anthropic-default")

    expect(result).toBe("anthropic-model")
    expect(createAnthropicMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "test-key",
        headers: FORCED_PROVIDER_HEADERS.anthropic,
      }),
    )
    expect(anthropicLanguageModelMock).toHaveBeenCalledWith("claude-haiku-4-5")
  })

  it("passes attribution headers for OpenRouter when user headers are undefined", async () => {
    getStorageItemMock.mockResolvedValue({
      providersConfig: [createOpenRouterProviderConfig()],
    })

    const { getModelById } = await import("../model")
    const result = await getModelById("openrouter-default")

    expect(result).toBe("custom-model")
    expect(createOpenAICompatibleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "openrouter",
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: "test-key",
        headers: FORCED_PROVIDER_HEADERS.openrouter,
        supportsStructuredOutputs: true,
      }),
    )
    expect(createOpenAICompatibleMock.mock.calls[0]?.[0]).not.toHaveProperty("url")
    expect(openAICompatibleLanguageModelMock).toHaveBeenCalledWith("x-ai/grok-4-fast:free")
  })

  it("passes Ollama root base URL and disables think on the language model", async () => {
    getStorageItemMock.mockResolvedValue({
      providersConfig: [createOllamaProviderConfig({ think: true })],
    })

    const { getModelById } = await import("../model")
    const result = await getModelById("ollama-default")

    expect(result).toBe("ollama-model")
    expect(createOllamaMock).toHaveBeenCalledWith({
      baseURL: "http://127.0.0.1:11434/",
    })
    expect(ollamaLanguageModelMock).toHaveBeenCalledWith("gemma3:4b", { think: false })
  })

  it("passes Azure settings and resolves the deployment name with languageModel", async () => {
    getStorageItemMock.mockResolvedValue({
      providersConfig: [
        {
          id: "azure-default",
          name: "Azure OpenAI",
          enabled: true,
          provider: "azure",
          apiKey: "azure-key",
          baseURL: "https://proxy.example.test/openai",
          model: {
            model: "gpt-5.4-mini",
            isCustomModel: true,
            customModel: "read-frog-gpt-4o",
          },
          providerSpecificSettings: {
            apiMode: "responses",
            resourceName: "read-frog-openai",
            apiVersion: "2025-04-01-preview",
          },
          headers: {
            "X-Test": "1",
          },
        },
      ],
    })

    const { getModelById } = await import("../model")
    const result = await getModelById("azure-default")

    expect(result).toBe("azure-model")
    expect(createAzureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceName: "read-frog-openai",
        apiVersion: "2025-04-01-preview",
        baseURL: "https://proxy.example.test/openai",
        apiKey: "azure-key",
        headers: {
          "X-Test": "1",
        },
      }),
    )
    expect(createAzureMock.mock.calls[0]?.[0]).not.toHaveProperty("apiMode")
    expect(createAzureMock.mock.calls[0]?.[0]).not.toHaveProperty("region")
    expect(azureLanguageModelMock).toHaveBeenCalledWith("read-frog-gpt-4o")
    expect(azureChatModelMock).not.toHaveBeenCalled()
  })

  it("uses Azure chat completions when API mode is chat", async () => {
    getStorageItemMock.mockResolvedValue({
      providersConfig: [
        {
          id: "azure-default",
          name: "Azure OpenAI",
          enabled: true,
          provider: "azure",
          apiKey: "azure-key",
          baseURL: "https://proxy.example.test/openai",
          model: {
            model: "gpt-5.4-mini",
            isCustomModel: true,
            customModel: "read-frog-gpt-4o",
          },
          providerSpecificSettings: {
            apiMode: "chat",
            resourceName: "read-frog-openai",
            apiVersion: "2025-04-01-preview",
          },
        },
      ],
    })

    const { getModelById } = await import("../model")
    const result = await getModelById("azure-default")

    expect(result).toBe("azure-chat-model")
    expect(createAzureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceName: "read-frog-openai",
        apiVersion: "2025-04-01-preview",
        baseURL: "https://proxy.example.test/openai",
        apiKey: "azure-key",
      }),
    )
    expect(createAzureMock.mock.calls[0]?.[0]).not.toHaveProperty("apiMode")
    expect(createAzureMock.mock.calls[0]?.[0]).not.toHaveProperty("region")
    expect(azureChatModelMock).toHaveBeenCalledWith("read-frog-gpt-4o")
    expect(azureLanguageModelMock).not.toHaveBeenCalled()
  })

  it("merges user headers over Anthropic's forced browser-access header", async () => {
    getStorageItemMock.mockResolvedValue({
      providersConfig: [createAnthropicProviderConfig({ "X-Test": "1" })],
    })

    const { getModelById } = await import("../model")
    await getModelById("anthropic-default")

    expect(createAnthropicMock).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          "X-Test": "1",
          ...FORCED_PROVIDER_HEADERS.anthropic,
        },
      }),
    )
  })

  it("still sends Anthropic's forced header when user headers are an explicit empty object", async () => {
    getStorageItemMock.mockResolvedValue({
      providersConfig: [createAnthropicProviderConfig({})],
    })

    const { getModelById } = await import("../model")
    await getModelById("anthropic-default")

    expect(createAnthropicMock).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: FORCED_PROVIDER_HEADERS.anthropic,
      }),
    )
  })

  it("passes custom headers for OpenAI-compatible providers", async () => {
    getStorageItemMock.mockResolvedValue({
      providersConfig: [
        {
          id: "custom-openai",
          name: "Custom Provider",
          enabled: true,
          provider: "openai-compatible",
          apiKey: "custom-key",
          baseURL: "http://127.0.0.1:1234/v1",
          model: {
            model: "use-custom-model",
            isCustomModel: true,
            customModel: "huihui-hy-mt1.5-1.8b-abliterated",
          },
          headers: {
            "HTTP-Referer": "https://example.com",
            "X-Title": "Read Frog",
          },
        },
      ],
    })

    const { getModelById } = await import("../model")
    const result = await getModelById("custom-openai")

    expect(result).toBe("custom-model")
    expect(createOpenAICompatibleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "openai-compatible",
        baseURL: "http://127.0.0.1:1234/v1",
        apiKey: "custom-key",
        headers: {
          "HTTP-Referer": "https://example.com",
          "X-Title": "Read Frog",
        },
      }),
    )
    expect(openAICompatibleLanguageModelMock).toHaveBeenCalledWith(
      "huihui-hy-mt1.5-1.8b-abliterated",
    )
  })

  it("uses the configured full endpoint for Open Responses providers", async () => {
    getStorageItemMock.mockResolvedValue({
      providersConfig: [
        {
          id: "custom-responses",
          name: "Custom Responses",
          enabled: true,
          provider: "open-responses",
          apiKey: "custom-key",
          url: "http://127.0.0.1:1234/v1/responses",
          model: {
            model: "use-custom-model",
            isCustomModel: true,
            customModel: "gpt-oss-120b",
          },
          headers: {
            "X-Test": "1",
          },
        },
      ],
    })

    const { getModelById } = await import("../model")
    const result = await getModelById("custom-responses")

    expect(result).toBe("custom-responses-model")
    expect(createOpenResponsesMock).toHaveBeenCalledWith({
      name: "open-responses",
      url: "http://127.0.0.1:1234/v1/responses",
      apiKey: "custom-key",
      headers: {
        "X-Test": "1",
      },
    })
    expect(createOpenResponsesMock.mock.calls[0]?.[0]).not.toHaveProperty("baseURL")
    expect(createOpenResponsesMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "supportsStructuredOutputs",
    )
    expect(openResponsesLanguageModelMock).toHaveBeenCalledWith("gpt-oss-120b")
  })

  describe("SiliconFlow sponsored and BYOK routing", () => {
    it("routes sponsored requests to the Cloudflare Worker gateway with signed headers and no client API key", async () => {
      getStorageItemMock.mockResolvedValue({
        providersConfig: [
          {
            id: "siliconflow-default",
            name: "SiliconFlow",
            enabled: true,
            provider: "siliconflow",
            baseURL: "https://api.siliconflow.cn/v1",
            model: {
              model: "tencent/Hunyuan-MT-7B",
              isCustomModel: false,
              customModel: null,
            },
            providerSpecificSettings: {
              authMode: "sponsored",
            },
          },
        ],
      })

      const { getModelById } = await import("../model")
      const result = await getModelById("siliconflow-default")

      expect(result).toBe("custom-model")
      expect(createOpenAICompatibleMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "siliconflow",
          baseURL: SILICONFLOW_SPONSORED_GATEWAY_URL,
          supportsStructuredOutputs: true,
          fetch: expect.any(Function),
          headers: expect.objectContaining({
            "X-Plugin-Client": "read-buddy",
          }),
        }),
      )
      expect(createOpenAICompatibleMock.mock.calls[0]?.[0]).not.toHaveProperty("apiKey")
      expect(openAICompatibleLanguageModelMock).toHaveBeenCalledWith("tencent/Hunyuan-MT-7B")

      // Verify that the injected fetch creates signed headers and strips Authorization
      const sponsorFetch = createOpenAICompatibleMock.mock.calls[0]?.[0]?.fetch
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(JSON.stringify({})))
      const proxyFetch = sponsorFetch
      // Call through the fetch function with a dummy request
      await proxyFetch("https://gateway.example.com", {
        method: "POST",
        headers: {
          Authorization: "Bearer unwanted-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "Test prompt" }] }),
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const sentHeaders = requestInit.headers as Headers
      expect(sentHeaders.get("X-Plugin-Client")).toBe("read-buddy")
      expect(sentHeaders.get("X-Timestamp")).toBeTruthy()
      expect(sentHeaders.get("X-Signature")).toMatch(/^[a-f0-9]{64}$/)
      expect(sentHeaders.get("Authorization")).toBeNull()
      fetchSpy.mockRestore()
    })

    it("routes BYOK requests directly to SiliconFlow API with user API key", async () => {
      getStorageItemMock.mockResolvedValue({
        providersConfig: [
          {
            id: "siliconflow-default",
            name: "SiliconFlow",
            enabled: true,
            provider: "siliconflow",
            baseURL: "https://api.siliconflow.cn/v1",
            apiKey: "sk-my-personal-key",
            model: {
              model: "tencent/Hunyuan-MT-7B",
              isCustomModel: false,
              customModel: null,
            },
            providerSpecificSettings: {
              authMode: "byok",
            },
          },
        ],
      })

      const { getModelById } = await import("../model")
      const result = await getModelById("siliconflow-default")

      expect(result).toBe("custom-model")
      expect(createOpenAICompatibleMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "siliconflow",
          baseURL: "https://api.siliconflow.cn/v1",
          apiKey: "sk-my-personal-key",
          supportsStructuredOutputs: true,
        }),
      )
      expect(createOpenAICompatibleMock.mock.calls[0]?.[0]?.fetch).toBeUndefined()
      expect(openAICompatibleLanguageModelMock).toHaveBeenCalledWith("tencent/Hunyuan-MT-7B")
    })

    it("resolves to BYOK mode when apiKey is present without explicit authMode", async () => {
      getStorageItemMock.mockResolvedValue({
        providersConfig: [
          {
            id: "siliconflow-default",
            name: "SiliconFlow",
            enabled: true,
            provider: "siliconflow",
            baseURL: "https://api.siliconflow.cn/v1",
            apiKey: "sk-legacy-key",
            model: {
              model: "Qwen/Qwen3-Next-80B-A3B-Instruct",
              isCustomModel: false,
              customModel: null,
            },
          },
        ],
      })

      const { getModelById } = await import("../model")
      await getModelById("siliconflow-default")

      expect(createOpenAICompatibleMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "siliconflow",
          baseURL: "https://api.siliconflow.cn/v1",
          apiKey: "sk-legacy-key",
        }),
      )
      expect(createOpenAICompatibleMock.mock.calls[0]?.[0]?.fetch).toBeUndefined()
    })

    it("resolves to sponsored mode when apiKey and authMode are both missing", async () => {
      getStorageItemMock.mockResolvedValue({
        providersConfig: [
          {
            id: "siliconflow-default",
            name: "SiliconFlow",
            enabled: true,
            provider: "siliconflow",
            baseURL: "https://api.siliconflow.cn/v1",
            model: {
              model: "tencent/Hunyuan-MT-7B",
              isCustomModel: false,
              customModel: null,
            },
          },
        ],
      })

      const { getModelById } = await import("../model")
      await getModelById("siliconflow-default")

      expect(createOpenAICompatibleMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "siliconflow",
          baseURL: SILICONFLOW_SPONSORED_GATEWAY_URL,
          fetch: expect.any(Function),
        }),
      )
      expect(createOpenAICompatibleMock.mock.calls[0]?.[0]).not.toHaveProperty("apiKey")
    })
  })
})
