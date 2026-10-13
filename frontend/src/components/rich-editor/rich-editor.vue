<script setup lang="ts">
import type { MediaType } from '@/api/media'
import { resolveMediaUrl } from '@/api/profile'
import { debounce } from '@/utils/debounce'
import { uploadMedia } from '@/utils/upload-media'
import { normalizeLinkUrl } from './rich-link'

/**
 * 富文本编辑器（mp-html editable 插件封装）。
 *
 * 注意：mp-html editable 为块级编辑模型，`modelValue` **仅作为首帧初始内容**，
 * 不响应外部后续变化（插件不支持编辑中用 content 二次设值，会覆盖编辑态）。
 * 编辑结果通过 update:modelValue 持续向外同步。
 */
interface RemoveDetail {
  type: string
  src: string | string[]
}

const props = withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
}>(), {
  modelValue: '',
  placeholder: '点击下方空白处开始编辑，点内容块可设置样式',
})

const emit = defineEmits<{
  'update:modelValue': [html: string]
  // 用户在气泡菜单删除图片/音视频时触发，业务侧可据此清理远端文件
  'remove': [detail: RemoveDetail]
}>()

// 非响应式：仅首帧绑定一次 :content
const initial = props.modelValue

const mpRef = ref<any>(null)
const wrapperRef = ref<any>(null)
const ready = ref(false)
let lastHtml = props.modelValue

// ---- 实例获取（Vue3 模板 ref 形态因 easycom/平台而异，多重兜底）----
function getCtx(): any {
  const r = mpRef.value
  if (!r)
    return null
  const ctx = r.$vm ?? r.context ?? r
  return typeof ctx?.getContent === 'function' ? ctx : null
}

// ---- 内容同步（三重冗余：工具栏动作延时同步 / tap 防抖 / H5 输入事件）----
function sync() {
  const ctx = getCtx()
  if (!ctx)
    return
  const html = ctx.getContent()
  if (html !== lastHtml) {
    lastHtml = html
    emit('update:modelValue', html)
  }
}

// 承接气泡菜单编辑后的 tap，以及键盘输入停顿
const scheduleSync = debounce(() => sync(), 350)

function onLoad() {
  const ctx = getCtx()
  if (!ctx)
    return
  // editable 插件通过实例上的 getSrc 获取图片/音视频/链接的线上地址
  ctx.getSrc = getSrc
  ready.value = true
}

function onRemove(detail: RemoveDetail) {
  emit('remove', detail)
  scheduleSync()
}

// ---- 工具栏动作 ----
type EditorMethod = 'undo' | 'redo' | 'clear' | 'insertText' | 'insertImg' | 'insertVideo' | 'insertAudio' | 'insertLink'

function runAction(method: EditorMethod) {
  if (!ready.value)
    return
  const ctx = getCtx()
  if (!ctx || typeof ctx[method] !== 'function')
    return
  ctx[method]()
  // undo/redo 插件内部有 200ms 延时；其余操作 80ms 后节点已插入
  setTimeout(sync, method === 'undo' || method === 'redo' ? 280 : 80)
}

function insertHtml(html: string) {
  if (!ready.value)
    return
  getCtx()?.insertHtml(html)
  setTimeout(sync, 80)
}

function insertList(kind: 'ul' | 'ol') {
  const count = kind === 'ol' ? 3 : 2
  const items = Array.from({ length: count }, () => '<li>列表项（点击可编辑文字）</li>').join('')
  insertHtml(`<${kind}>${items}</${kind}>`)
}

function confirmClear() {
  uni.showModal({
    title: '清空内容',
    content: '确定清空全部内容吗？此操作可通过撤销恢复。',
    success: (res) => {
      if (res.confirm)
        runAction('clear')
    },
  })
}

defineExpose({
  sync,
  undo: () => runAction('undo'),
  redo: () => runAction('redo'),
  clear: confirmClear,
  insertHtml,
})

// ---- getSrc：选择文件 → COS 直传 → 返回线上 URL ----
type SrcType = 'img' | 'video' | 'audio' | 'link'

interface PendingSource {
  file?: File // H5
  path?: string // MP 临时路径
  name: string
  size: number
  contentType: string
  width?: number
  height?: number
  duration?: number
}

const TYPE_UI: Record<Exclude<SrcType, 'link'>, {
  mediaType: MediaType
  accept: string
  extensions: string[]
  maxBytes: number
  defaultMime: string
}> = {
  img: {
    mediaType: 'image',
    accept: 'image/jpeg,image/png,image/webp,image/gif,image/bmp',
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    maxBytes: 10 * 1024 * 1024,
    defaultMime: 'image/jpeg',
  },
  video: {
    mediaType: 'video',
    accept: 'video/mp4,video/quicktime,video/webm',
    extensions: ['mp4', 'mov', 'webm'],
    maxBytes: 500 * 1024 * 1024,
    defaultMime: 'video/mp4',
  },
  audio: {
    mediaType: 'audio',
    accept: 'audio/mpeg,audio/wav,audio/aac,audio/mp4',
    extensions: ['mp3', 'm4a', 'wav', 'aac'],
    maxBytes: 50 * 1024 * 1024,
    defaultMime: 'audio/mpeg',
  },
}

function pickLink(oldValue?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.showModal({
      title: oldValue ? '更换链接' : '插入链接',
      editable: true,
      placeholderText: 'https://example.com',
      content: oldValue || '',
      success: (res) => {
        if (!res.confirm) {
          reject(new Error('cancel'))
          return
        }
        const url = normalizeLinkUrl(res.content ?? '')
        if (!url) {
          uni.showToast({ title: '请输入合法的 http(s) 链接', icon: 'none' })
          reject(new Error('invalid'))
          return
        }
        resolve(url)
      },
      fail: () => reject(new Error('cancel')),
    })
  })
}

async function getSrc(type: SrcType, oldValue?: string): Promise<string | string[] | { src: string, name: string }> {
  let result: string | string[] | { src: string, name: string }
  if (type === 'link') {
    result = await pickLink(oldValue)
  }
  else {
    const ui = TYPE_UI[type]
    // 仅新增图片时允许多选；换图/封面/音视频均单选
    const allowMultiple = type === 'img' && !oldValue
    const sources = await chooseSources(type, allowMultiple)

    const valid: PendingSource[] = []
    for (const source of sources) {
      if (source.size > ui.maxBytes) {
        uni.showToast({ title: `「${source.name}」大小超限`, icon: 'none' })
        continue
      }
      valid.push(source)
    }
    if (!valid.length)
      throw new Error('no valid file')

    uni.showLoading({ title: '上传中', mask: true })
    try {
      const urls: string[] = []
      for (const source of valid) {
        const row = await uploadMedia({ ...source, type: ui.mediaType })
        urls.push(resolveMediaUrl(row.url))
      }
      if (type === 'audio')
        result = { src: urls[0]!, name: valid[0]!.name }
      else if (type === 'img')
        result = urls.length > 1 ? urls : urls[0]!
      else
        result = urls[0]!
    }
    catch (err) {
      // 401 等已由请求拦截器统一提示；此处兜底网络/直传错误
      uni.showToast({ title: err instanceof Error ? err.message : '上传失败', icon: 'none' })
      throw err
    }
    finally {
      uni.hideLoading()
    }
  }
  // 插件在 then 中同步插入节点，稍后同步给外层（上传类多留余量等待节点入树）
  setTimeout(sync, type === 'link' ? 80 : 150)
  return result
}

// ---- 文件选择（H5 动态 input / 微信小程序 chooseMedia|chooseMessageFile）----
let h5Input: HTMLInputElement | null = null
let h5Resolve: ((sources: PendingSource[]) => void) | null = null
let h5Reject: ((reason?: unknown) => void) | null = null
let h5Pending: { type: Exclude<SrcType, 'link'>, multiple: boolean } | null = null

function ensureH5Input() {
  if (h5Input)
    return
  h5Input = document.createElement('input')
  h5Input.type = 'file'
  h5Input.style.display = 'none'
  h5Input.addEventListener('change', onH5Change)
  document.body.appendChild(h5Input)
}

function onH5Change(event: Event) {
  const input = event.target as HTMLInputElement
  const resolve = h5Resolve
  const reject = h5Reject
  const pending = h5Pending
  h5Resolve = null
  h5Reject = null
  h5Pending = null
  const files = input.files ? Array.from(input.files) : []
  input.value = ''
  if (!resolve || !reject || !pending)
    return
  if (!files.length) {
    reject(new Error('cancel'))
    return
  }
  const ui = TYPE_UI[pending.type]
  resolve(files.map(file => ({
    file,
    name: file.name,
    size: file.size,
    contentType: file.type || ui.defaultMime,
  })))
}

function chooseSources(type: Exclude<SrcType, 'link'>, allowMultiple: boolean): Promise<PendingSource[]> {
  // 与 upload-media.ts 相同的条件编译写法：在同一函数体内按平台分支，避免 return-after-return
  return new Promise((resolve, reject) => {
    // #ifdef H5
    ensureH5Input()
    if (!h5Input) {
      reject(new Error('input unavailable'))
      return
    }
    h5Resolve = resolve
    h5Reject = reject
    h5Pending = { type, multiple: allowMultiple }
    h5Input.accept = TYPE_UI[type].accept
    h5Input.multiple = allowMultiple
    h5Input.click()
    // #endif
    // #ifdef MP-WEIXIN
    if (type === 'audio') {
      uni.chooseMessageFile({
        count: allowMultiple ? 9 : 1,
        type: 'file',
        extension: TYPE_UI.audio.extensions,
        success: (res) => {
          resolve(res.tempFiles.map(f => ({
            path: f.path,
            name: f.name,
            size: f.size,
            contentType: TYPE_UI.audio.defaultMime,
          })))
        },
        fail: () => reject(new Error('cancel')),
      })
      return
    }
    uni.chooseMedia({
      count: allowMultiple ? 9 : 1,
      mediaType: [type === 'img' ? 'image' : 'video'],
      sourceType: ['album', 'camera'],
      ...(type === 'video' ? { maxDuration: 60 } : {}),
      success: (res) => {
        const ui = TYPE_UI[type]
        resolve(res.tempFiles.map(f => ({
          path: f.tempFilePath,
          name: f.tempFilePath.split('/').pop() || `${type}-${Date.now()}`,
          size: f.size,
          contentType: ui.defaultMime,
          ...(f.width ? { width: f.width } : {}),
          ...(f.height ? { height: f.height } : {}),
          ...(f.duration ? { duration: Math.round(f.duration) } : {}),
        })))
      },
      fail: () => reject(new Error('cancel')),
    })
    // #endif
  })
}

// H5：textarea 的 input/blur 为原生事件，blur 时插件才把文本提交进 nodes
// #ifdef H5
function onNativeInput() {
  scheduleSync()
}
function onNativeBlur() {
  setTimeout(sync, 30)
}
onMounted(() => {
  const el = (wrapperRef.value?.$el ?? wrapperRef.value) as HTMLElement | undefined
  el?.addEventListener('input', onNativeInput)
  // blur 不冒泡，用捕获阶段接收
  el?.addEventListener('blur', onNativeBlur, true)
})
onUnmounted(() => {
  scheduleSync.cancel()
  const el = (wrapperRef.value?.$el ?? wrapperRef.value) as HTMLElement | undefined
  el?.removeEventListener('input', onNativeInput)
  el?.removeEventListener('blur', onNativeBlur, true)
  h5Input?.remove()
  h5Input = null
})
// #endif
</script>

<template>
  <view>
    <!-- 工具栏：窄屏自动换行多排，组内紧凑、组间宽松以区分分组 -->
    <view class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pb-1">
      <view class="flex flex-nowrap items-center gap-1">
        <view
          class="flex shrink-0 cursor-pointer items-center gap-1 border border-line rounded-md px-2 py-1 text-11px text-ink"
          :class="!ready && 'pointer-events-none opacity-40'"
          @tap="runAction('undo')"
        >
          <text class="i-carbon-undo text-12px" />
          撤销
        </view>
        <view
          class="flex shrink-0 cursor-pointer items-center gap-1 border border-line rounded-md px-2 py-1 text-11px text-ink"
          :class="!ready && 'pointer-events-none opacity-40'"
          @tap="runAction('redo')"
        >
          <text class="i-carbon-redo text-12px" />
          重做
        </view>
        <view
          class="flex shrink-0 cursor-pointer items-center gap-1 border border-line rounded-md px-2 py-1 text-11px text-danger"
          :class="!ready && 'pointer-events-none opacity-40'"
          @tap="confirmClear"
        >
          <text class="i-carbon-trash-can text-12px" />
          清空
        </view>
      </view>

      <view class="flex flex-nowrap items-center gap-1">
        <view
          class="flex shrink-0 cursor-pointer items-center gap-1 border border-line rounded-md px-2 py-1 text-11px text-ink"
          :class="!ready && 'pointer-events-none opacity-40'"
          @tap="runAction('insertText')"
        >
          <text class="i-carbon-text-new-line text-12px" />
          文本
        </view>
        <view
          class="flex shrink-0 cursor-pointer items-center gap-1 border border-line rounded-md px-2 py-1 text-11px text-ink"
          :class="!ready && 'pointer-events-none opacity-40'"
          @tap="runAction('insertImg')"
        >
          <text class="i-carbon-image text-12px" />
          图片
        </view>
        <view
          class="flex shrink-0 cursor-pointer items-center gap-1 border border-line rounded-md px-2 py-1 text-11px text-ink"
          :class="!ready && 'pointer-events-none opacity-40'"
          @tap="runAction('insertVideo')"
        >
          <text class="i-carbon-video text-12px" />
          视频
        </view>
        <view
          class="flex shrink-0 cursor-pointer items-center gap-1 border border-line rounded-md px-2 py-1 text-11px text-ink"
          :class="!ready && 'pointer-events-none opacity-40'"
          @tap="runAction('insertAudio')"
        >
          <text class="i-carbon-music text-12px" />
          音频
        </view>
        <view
          class="flex shrink-0 cursor-pointer items-center gap-1 border border-line rounded-md px-2 py-1 text-11px text-ink"
          :class="!ready && 'pointer-events-none opacity-40'"
          @tap="runAction('insertLink')"
        >
          <text class="i-carbon-link text-12px" />
          链接
        </view>
      </view>

      <view class="flex flex-nowrap items-center gap-1">
        <view
          class="flex shrink-0 cursor-pointer items-center gap-1 border border-line rounded-md px-2 py-1 text-11px text-ink"
          :class="!ready && 'pointer-events-none opacity-40'"
          @tap="insertList('ul')"
        >
          <text class="i-carbon-list text-12px" />
          无序列表
        </view>
        <view
          class="flex shrink-0 cursor-pointer items-center gap-1 border border-line rounded-md px-2 py-1 text-11px text-ink"
          :class="!ready && 'pointer-events-none opacity-40'"
          @tap="insertList('ol')"
        >
          <text class="i-carbon-list-numbered text-12px" />
          有序列表
        </view>
      </view>
    </view>

    <!-- 编辑卡片：editable 不可置于 scroll-view；overflow-visible 避免气泡菜单被裁切 -->
    <view
      ref="wrapperRef"
      class="mt-3 min-h-300px overflow-visible border border-line rounded-xl bg-card p-4"
      @tap="scheduleSync"
    >
      <mp-html
        ref="mpRef"
        editable
        :content="initial"
        :placeholder="placeholder"
        @load="onLoad"
        @remove="onRemove"
      />
    </view>
  </view>
</template>
