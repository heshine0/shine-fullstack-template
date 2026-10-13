const SOURCE = 'txwx-rich-editor' as const

type MessageType = 'ready' | 'update' | 'done' | 'cancel' | 'error'

interface BridgeMessage {
  source: typeof SOURCE
  type: MessageType
  [key: string]: unknown
}

/** 微信 web-view 内 wx.miniProgram 提供的桥接能力。 */
interface WxMiniProgramBridge {
  postMessage: (message: { data: BridgeMessage }) => void
  navigateBack: () => void
}

interface WindowWithWx extends Window {
  wx?: { miniProgram?: WxMiniProgramBridge }
}

/**
 * H5 宿主 origin，用于 window.parent.postMessage 的 targetOrigin 校验。
 * 1. 生产显式配置 VITE_EDITOR_H5_ORIGIN（H5 域名），最安全；
 * 2. iframe 内 document.referrer 即宿主页面地址，开发态（:3000 编辑器嵌入 :9000 宿主）
 *    据此拿到真实宿主 origin，避免 targetOrigin 与父窗口不匹配导致消息被浏览器丢弃；
 * 3. 非嵌入场景兜底当前 origin。
 */
function getH5Origin(): string {
  const configured = import.meta.env.VITE_EDITOR_H5_ORIGIN
  if (configured) return configured
  if (document.referrer) {
    try {
      return new URL(document.referrer).origin
    } catch {
      // referrer 非法时落到兜底
    }
  }
  return window.location.origin
}

/** 是否在微信 web-view 环境中。 */
function isWeChatWebView(): boolean {
  const ua = navigator.userAgent.toLowerCase()
  return ua.includes('miniprogram')
}

/** 动态加载微信 JS-SDK。 */
function loadWeChatSdk(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as WindowWithWx).wx?.miniProgram) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://res.wx.qq.com/open/js/jweixin-1.3.2.js'
    script.onload = () => resolve()
    script.onerror = () => resolve()
    document.head.appendChild(script)
  })
}

export function useEditorBridge() {
  // composable 在 setup 顶层调用，SSR 阶段无 navigator/window：
  // 环境探测必须限定在客户端，否则服务端渲染直接 500（ClientOnly 只保护模板，不保护 setup）
  const isWeChat = import.meta.client && isWeChatWebView()

  if (isWeChat) void loadWeChatSdk()

  function getWx(): WxMiniProgramBridge | undefined {
    return (window as WindowWithWx).wx?.miniProgram
  }

  function postMessage(msg: Omit<BridgeMessage, 'source'>) {
    const full = { source: SOURCE, ...msg } as BridgeMessage
    const wx = getWx()
    if (isWeChat && wx) {
      wx.postMessage({ data: full })
    } else {
      window.parent.postMessage(full, getH5Origin())
    }
  }

  function done(data: { draftId: string, html: string }) {
    postMessage({ type: 'done', ...data })
    if (isWeChat) getWx()?.navigateBack()
  }

  function cancel() {
    postMessage({ type: 'cancel' })
    if (isWeChat) getWx()?.navigateBack()
  }

  return { postMessage, done, cancel }
}
