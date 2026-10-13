import { createDraft, getDraft } from '@/api/editor'

const SOURCE = 'txwx-rich-editor'
const VALID_TYPES = ['ready', 'update', 'done', 'cancel', 'error'] as const

export interface BridgeMessage {
  source: typeof SOURCE
  type: (typeof VALID_TYPES)[number]
  [key: string]: unknown
}

export interface RichEditorResult {
  html: string
}

interface OpenOptions {
  initial?: string
}

/**
 * 桥消息协议归约：校验 source 与 type，非法消息返回 null。
 */
export function parseBridgeMessage(data: unknown): BridgeMessage | null {
  if (!data || typeof data !== 'object')
    return null
  const msg = data as Record<string, unknown>
  if (msg.source !== SOURCE)
    return null
  if (!VALID_TYPES.includes(msg.type as (typeof VALID_TYPES)[number]))
    return null
  return data as unknown as BridgeMessage
}

/**
 * 打开富文本编辑器。建草稿 → 跳转宿主页 → 事件总线接收 done/cancel。
 * done 时 GET 草稿最终 HTML（以服务端为准）；cancel/系统返回 → null。
 */
export function openRichEditor(options: OpenOptions = {}): Promise<RichEditorResult | null> {
  return new Promise((resolve) => {
    const onDone = async (data: { draftId: string }) => {
      cleanup()
      try {
        const draft = await getDraft(data.draftId)
        resolve({ html: draft.content })
      }
      catch {
        resolve(null)
      }
    }

    const onCancel = () => {
      cleanup()
      resolve(null)
    }

    function cleanup() {
      uni.$off('rich-editor:done', onDone)
      uni.$off('rich-editor:cancel', onCancel)
    }

    // 建草稿 + 跳转逻辑抽为 async function，避免 async Promise executor
    // （no-async-promise-executor）；对外签名与 resolve 时机保持不变。
    async function launch() {
      let draftId: string
      try {
        const draft = await createDraft({ content: options.initial ?? '' })
        draftId = draft.id
      }
      catch {
        uni.showToast({ title: '创建草稿失败', icon: 'none' })
        resolve(null)
        return
      }

      uni.$on('rich-editor:done', onDone)
      uni.$on('rich-editor:cancel', onCancel)

      uni.navigateTo({ url: `/pages/webview/editor/index?draftId=${draftId}` })
    }

    launch().catch(() => resolve(null))
  })
}
