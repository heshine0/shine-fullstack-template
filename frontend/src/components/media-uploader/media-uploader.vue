<script setup lang="ts">
import type { MediaItem, MediaType } from '@/api/media'
import { uploadMedia } from '@/utils/upload-media'

interface PendingSource {
  kind: 'h5' | 'mp'
  file?: File // H5
  path?: string // 小程序临时路径
  name: string
  size: number
  contentType: string
  width?: number
  height?: number
  duration?: number
}

const props = withDefaults(defineProps<{
  type: MediaType
  modelValue?: MediaItem[]
  multiple?: boolean
  maxCount?: number
  disabled?: boolean
  /** 裸模式：不渲染组件自带触发区与结果 UI，仅通过 expose 的 trigger() 与 change 事件工作。 */
  bare?: boolean
}>(), {
  modelValue: () => [],
  multiple: false,
  maxCount: undefined,
  disabled: false,
  bare: false,
})

const emit = defineEmits<{
  'update:modelValue': [items: MediaItem[]]
  'change': [items: MediaItem[]]
}>()

/** 各类型 UI 常量。 */
const TYPE_UI: Record<MediaType, {
  accept: string
  extensions: string[]
  hint: string
  maxBytes: number
  defaultMime: string
}> = {
  image: {
    accept: 'image/jpeg,image/png,image/webp,image/gif,image/bmp',
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    hint: '点击上传图片，支持 jpg / png / webp / gif，单张 ≤10MB',
    maxBytes: 10 * 1024 * 1024,
    defaultMime: 'image/jpeg',
  },
  video: {
    accept: 'video/mp4,video/quicktime,video/webm',
    extensions: ['mp4', 'mov', 'webm'],
    hint: '点击上传视频，支持 mp4 / mov / webm，单个 ≤500MB',
    maxBytes: 500 * 1024 * 1024,
    defaultMime: 'video/mp4',
  },
  audio: {
    accept: 'audio/mpeg,audio/wav,audio/aac,audio/mp4',
    extensions: ['mp3', 'm4a', 'wav', 'aac'],
    hint: '点击上传音频，支持 mp3 / wav / m4a，单个 ≤50MB（小程序从聊天记录选择）',
    maxBytes: 50 * 1024 * 1024,
    defaultMime: 'audio/mpeg',
  },
  file: {
    accept: '.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt',
    extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'txt'],
    hint: '点击上传文件，支持 pdf / doc / xls / zip，单个 ≤50MB（小程序从聊天记录选择）',
    maxBytes: 50 * 1024 * 1024,
    defaultMime: 'application/octet-stream',
  },
}

const effectiveMaxCount = computed(() => props.maxCount ?? (props.multiple ? 9 : 1))
const ui = computed(() => TYPE_UI[props.type])

// ---- v-model 同步 ----
const items = ref<MediaItem[]>([...props.modelValue])
watch(() => props.modelValue, (v) => {
  if (v !== items.value)
    items.value = [...v]
})
watch(items, (v) => {
  emit('update:modelValue', v)
  emit('change', v)
}, { deep: true })

const canAdd = computed(() => !props.disabled && items.value.length < effectiveMaxCount.value)

// 上传源（重试用，非响应式）
const pendingSources = new Map<string, PendingSource>()

function makeTempId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0)
    return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}

function localPreviewUrl(source: PendingSource): string {
  let url = ''
  // #ifdef H5
  url = URL.createObjectURL(source.file!)
  // #endif
  // #ifdef MP-WEIXIN
  url = source.path!
  // #endif
  return url
}

// H5 隐藏 input（命令式创建：避免模板中 input[type=file] 与 uniapp input 类型冲突）
let h5Input: HTMLInputElement | null = null

// ---- 触发选择 ----
function onTrigger() {
  if (!canAdd.value)
    return
  // #ifdef H5
  if (h5Input) {
    h5Input.accept = ui.value.accept
    h5Input.multiple = props.multiple
    h5Input.click()
  }
  // #endif
  // #ifdef MP-WEIXIN
  void chooseMp()
  // #endif
}

function onInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length) {
    const sources: PendingSource[] = Array.from(input.files).map(file => ({
      kind: 'h5',
      file,
      name: file.name,
      size: file.size,
      contentType: file.type || ui.value.defaultMime,
    }))
    void enqueue(sources)
  }
  input.value = ''
}

// 小程序选择
function chooseMp(): Promise<void> {
  const count = effectiveMaxCount.value - items.value.length
  if (props.type === 'image' || props.type === 'video') {
    return new Promise((resolve) => {
      uni.chooseMedia({
        count,
        mediaType: [props.type as 'image' | 'video'],
        sourceType: ['album', 'camera'],
        ...(props.type === 'video' ? { maxDuration: 60 } : {}),
        success: (res) => {
          const sources: PendingSource[] = res.tempFiles.map(f => ({
            kind: 'mp',
            path: f.tempFilePath,
            name: f.tempFilePath.split('/').pop() || `${props.type}-${Date.now()}`,
            size: f.size,
            contentType: ui.value.defaultMime,
            ...(f.width ? { width: f.width } : {}),
            ...(f.height ? { height: f.height } : {}),
            ...(f.duration ? { duration: Math.round(f.duration) } : {}),
          }))
          void enqueue(sources)
          resolve()
        },
        fail: () => resolve(),
      })
    })
  }
  return new Promise((resolve) => {
    uni.chooseMessageFile({
      count,
      type: 'file',
      ...(props.type === 'audio' ? { extension: ui.value.extensions } : {}),
      success: (res) => {
        const sources: PendingSource[] = res.tempFiles.map(f => ({
          kind: 'mp',
          path: f.path,
          name: f.name,
          size: f.size,
          contentType: ui.value.defaultMime,
        }))
        void enqueue(sources)
        resolve()
      },
      fail: () => resolve(),
    })
  })
}

async function enqueue(sources: PendingSource[]) {
  const room = effectiveMaxCount.value - items.value.length
  for (const source of sources.slice(0, room)) {
    if (source.size > ui.value.maxBytes) {
      uni.showToast({ title: `「${source.name}」大小超限`, icon: 'none' })
      continue
    }
    const tempId = makeTempId()
    pendingSources.set(tempId, source)
    items.value.push({
      id: tempId,
      url: localPreviewUrl(source),
      type: props.type,
      metadata: {
        name: source.name,
        size: source.size,
        mimeType: source.contentType,
      },
      status: 'uploading',
      progress: 0,
    })
    void process(tempId)
  }
}

async function process(tempId: string) {
  const source = pendingSources.get(tempId)
  const current = items.value.find(i => i.id === tempId)
  if (!source || !current)
    return

  try {
    const row = await uploadMedia(
      { ...source, type: props.type },
      {
        onProgress: (progress) => {
          const target = items.value.find(i => i.id === tempId)
          if (target)
            target.progress = progress
        },
      },
    )

    const idx = items.value.findIndex(i => i.id === tempId)
    if (idx >= 0) {
      items.value[idx] = {
        id: row.id,
        url: row.url,
        type: row.type,
        metadata: row.metadata,
        status: 'done',
        progress: 100,
      }
    }
    pendingSources.delete(tempId)
  }
  catch (err) {
    const target = items.value.find(i => i.id === tempId)
    if (target) {
      target.status = 'error'
      target.errorMessage = err instanceof Error ? err.message : '上传失败'
      uni.showToast({ title: target.errorMessage, icon: 'none' })
    }
  }
}

function retry(tempId: string) {
  const source = pendingSources.get(tempId)
  const target = items.value.find(i => i.id === tempId)
  if (!source || !target)
    return
  target.status = 'uploading'
  target.progress = 0
  target.errorMessage = undefined
  void process(tempId)
}

// ---- 音频播放（声明在前：removeItem 需要引用）----
let audioCtx: UniApp.InnerAudioContext | null = null
const playingId = ref('')

function removeItem(id: string) {
  const idx = items.value.findIndex(i => i.id === id)
  if (idx < 0)
    return
  // #ifdef H5
  if (id.startsWith('local-'))
    URL.revokeObjectURL(items.value[idx]!.url)
  // #endif
  pendingSources.delete(id)
  if (playingId.value === id) {
    audioCtx?.destroy()
    audioCtx = null
    playingId.value = ''
  }
  items.value.splice(idx, 1)
}

function togglePlay(item: MediaItem) {
  if (item.status !== 'done')
    return
  if (playingId.value === item.id && audioCtx) {
    audioCtx.pause()
    playingId.value = ''
    return
  }
  audioCtx?.destroy()
  const ctx = uni.createInnerAudioContext()
  ctx.src = item.url
  ctx.onEnded(() => {
    playingId.value = ''
  })
  ctx.onError(() => {
    playingId.value = ''
  })
  ctx.play()
  audioCtx = ctx
  playingId.value = item.id
}

onMounted(() => {
  // #ifdef H5
  h5Input = document.createElement('input')
  h5Input.type = 'file'
  h5Input.style.display = 'none'
  h5Input.addEventListener('change', onInputChange)
  document.body.appendChild(h5Input)
  // #endif
})

onUnmounted(() => {
  audioCtx?.destroy()
  // #ifdef H5
  h5Input?.remove()
  h5Input = null
  // #endif
})

// 供父组件以自定义触发器调用（如资料页点击头像行）
defineExpose({
  trigger: onTrigger,
  reset: () => {
    items.value = []
  },
})
</script>

<template>
  <view>
    <!-- 触发区 -->
    <view
      v-if="!bare && canAdd"
      class="flex flex-col items-center justify-center gap-2 border border-line-strong rounded-xl border-dashed px-6 py-8"
      @click="onTrigger"
    >
      <text class="i-carbon-cloud-upload text-28px text-muted" />
      <text class="text-sm font-medium">
        {{ type === 'image' ? '上传图片' : type === 'video' ? '上传视频' : type === 'audio' ? '上传音频' : '上传文件' }}
      </text>
      <text class="text-xs text-muted">{{ ui.hint }}</text>
    </view>

    <!-- 图片网格 -->
    <view
      v-if="!bare && type === 'image' && items.length"
      class="grid grid-cols-3 mt-4 gap-3"
    >
      <view
        v-for="item in items"
        :key="item.id"
        class="relative aspect-[4/3] overflow-hidden border rounded-lg"
        :class="item.status === 'error' ? 'border-danger' : 'border-line'"
      >
        <image
          v-if="item.status !== 'error'"
          :src="item.url"
          mode="aspectFill"
          class="h-full w-full"
        />
        <view v-else class="h-full w-full flex flex-col items-center justify-center gap-1 bg-danger-soft">
          <text class="i-carbon-warning-alt text-20px text-danger" />
          <text class="text-xs text-primary font-medium" @click="retry(item.id)">重试</text>
        </view>
        <view
          v-if="item.status === 'uploading'"
          class="absolute inset-0 flex items-center justify-center bg-black/40"
        >
          <text class="text-xs text-white font-medium">{{ item.progress ?? 0 }}%</text>
        </view>
        <view
          v-if="!disabled"
          class="absolute right-1 top-1 h-5 w-5 flex items-center justify-center rounded-full bg-white/90"
          @click.stop="removeItem(item.id)"
        >
          <text class="i-carbon-close text-12px text-sub" />
        </view>
      </view>
    </view>

    <!-- 视频 -->
    <view v-if="!bare && type === 'video'" class="mt-4 space-y-3">
      <view
        v-for="(item, idx) in items"
        :key="item.id"
        class="overflow-hidden border border-line rounded-lg"
      >
        <video
          v-if="item.status !== 'error'"
          :id="`video-${idx}`"
          :src="item.url"
          class="w-full bg-black"
          style="height: 200px"
        />
        <view v-else class="flex items-center justify-between gap-2 bg-danger-soft px-3 py-4">
          <text class="text-sm text-danger">{{ item.errorMessage || '上传失败' }}</text>
          <text class="text-xs text-primary font-medium" @click="retry(item.id)">重试</text>
        </view>
        <view class="flex items-center justify-between gap-2 px-3 py-2">
          <text class="truncate text-xs text-muted">
            {{ item.metadata.name }} · {{ formatSize(item.metadata.size)
            }}<template v-if="item.metadata.duration"> · {{ item.metadata.duration }}s</template>
          </text>
          <text
            v-if="!disabled"
            class="i-carbon-trash-can text-16px text-muted"
            @click="removeItem(item.id)"
          />
        </view>
      </view>
    </view>

    <!-- 音频 -->
    <view v-if="!bare && type === 'audio'" class="mt-4 space-y-2">
      <view
        v-for="item in items"
        :key="item.id"
        class="flex flex-wrap items-center gap-3 border border-line rounded-lg p-3"
      >
        <template v-if="item.status !== 'error'">
          <text class="i-carbon-music text-20px text-muted" />
          <view
            class="h-8 w-8 flex items-center justify-center rounded-full bg-primary-soft"
            @click="togglePlay(item)"
          >
            <text
              :class="playingId === item.id ? 'i-carbon-pause-filled' : 'i-carbon-play-filled'"
              class="text-primary-soft-text text-16px"
            />
          </view>
        </template>
        <template v-else>
          <text class="i-carbon-warning-alt text-20px text-danger" />
          <text class="flex-1 text-sm text-danger">{{ item.errorMessage || '上传失败' }}</text>
          <text class="text-xs text-primary font-medium" @click="retry(item.id)">重试</text>
        </template>
        <text class="ml-auto text-xs text-muted">
          {{ item.metadata.name }} · {{ formatSize(item.metadata.size)
          }}<template v-if="item.metadata.duration"> · {{ item.metadata.duration }}s</template>
        </text>
        <text
          v-if="!disabled"
          class="i-carbon-trash-can text-16px text-muted"
          @click="removeItem(item.id)"
        />
      </view>
    </view>

    <!-- 文件列表 -->
    <view v-if="!bare && type === 'file'" class="mt-4 space-y-2">
      <view
        v-for="item in items"
        :key="item.id"
        class="flex items-center gap-3 border rounded-lg px-3 py-2"
        :class="item.status === 'error'
          ? 'border-danger bg-danger-soft'
          : 'border-line'"
      >
        <text
          :class="item.status === 'error' ? 'i-carbon-warning-alt text-danger' : 'i-carbon-document text-muted'"
          class="text-20px"
        />
        <view class="min-w-0 flex-1">
          <text class="block truncate text-sm font-medium">{{ item.metadata.name || '未命名' }}</text>
          <text class="text-xs text-muted">
            {{ formatSize(item.metadata.size) }}
            <template v-if="item.status === 'uploading'"> · 上传中 {{ item.progress ?? 0 }}%</template>
            <template v-else-if="item.status === 'error'"> · {{ item.errorMessage || '上传失败' }}</template>
          </text>
        </view>
        <text
          v-if="item.status === 'error'"
          class="text-xs text-primary font-medium"
          @click="retry(item.id)"
        >
          重试
        </text>
        <text
          v-if="!disabled"
          class="i-carbon-trash-can text-16px text-muted"
          @click="removeItem(item.id)"
        />
      </view>
    </view>
  </view>
</template>
