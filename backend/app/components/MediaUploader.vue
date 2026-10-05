<script setup lang="ts">
type MediaType = 'image' | 'video' | 'audio' | 'file'

interface MediaMetadata {
  key?: string
  bucket?: string
  region?: string
  mimeType?: string
  size?: number
  etag?: string
  name?: string
  width?: number
  height?: number
  duration?: number
  [key: string]: unknown
}

export interface MediaItem {
  id: string
  url: string
  type: MediaType
  metadata: MediaMetadata
  status?: 'uploading' | 'done' | 'error'
  progress?: number
  errorMessage?: string
}

const props = withDefaults(defineProps<{
  type: MediaType
  modelValue?: MediaItem[]
  multiple?: boolean
  maxCount?: number
  disabled?: boolean
}>(), {
  modelValue: () => [],
  multiple: false,
  maxCount: undefined,
  disabled: false
})

const emit = defineEmits<{
  'update:modelValue': [items: MediaItem[]]
  'change': [items: MediaItem[]]
}>()

/** 各类型 UI 常量：input accept、文案、大小上限。 */
const TYPE_UI: Record<MediaType, { accept: string, hint: string, maxBytes: number }> = {
  image: {
    accept: 'image/jpeg,image/png,image/webp,image/gif,image/bmp',
    hint: '点击或拖拽上传图片，支持 jpg / png / webp / gif，单张 ≤10MB',
    maxBytes: 10 * 1024 * 1024
  },
  video: {
    accept: 'video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm',
    hint: '点击或拖拽上传视频，支持 mp4 / mov / avi / mkv / webm，单个 ≤500MB',
    maxBytes: 500 * 1024 * 1024
  },
  audio: {
    accept: 'audio/mpeg,audio/wav,audio/aac,audio/ogg,audio/flac,audio/mp4',
    hint: '点击或拖拽上传音频，支持 mp3 / wav / m4a / flac，单个 ≤50MB',
    maxBytes: 50 * 1024 * 1024
  },
  file: {
    accept: '.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt,application/pdf,application/zip,application/msword,text/plain',
    hint: '点击或拖拽上传文件，支持 pdf / doc / xls / zip，单个 ≤50MB',
    maxBytes: 50 * 1024 * 1024
  }
}

const toast = useToast()

const effectiveMaxCount = computed(() => props.maxCount ?? (props.multiple ? 9 : 1))
const canAdd = computed(() => !props.disabled && items.value.length < effectiveMaxCount.value)

// ---- 列表状态（v-model 双向同步）----
const items = ref<MediaItem[]>([...props.modelValue])
watch(() => props.modelValue, (v) => {
  if (v !== items.value) items.value = [...v]
})
watch(items, (v) => {
  emit('update:modelValue', v)
  emit('change', v)
}, { deep: true })

// ---- 文件选择（隐藏 input）----
const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

function openPicker() {
  if (!canAdd.value) return
  fileInput.value?.click()
}

function onInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length) void handleFiles(input.files)
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragOver.value = false
  if (!canAdd.value || !event.dataTransfer?.files?.length) return
  void handleFiles(event.dataTransfer.files)
}

function onDragOver(event: DragEvent) {
  if (!canAdd.value) return
  event.preventDefault()
  dragOver.value = true
}

// 上传中的原始文件（重试用，不入响应式）
const pendingFiles = new Map<string, File>()

function makeTempId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

async function handleFiles(fileList: FileList) {
  const files = Array.from(fileList).slice(0, effectiveMaxCount.value - items.value.length)
  for (const file of files) {
    if (file.size > TYPE_UI[props.type].maxBytes) {
      toast.add({ title: `「${file.name}」大小超过限制`, color: 'error' })
      continue
    }
    const tempId = makeTempId()
    pendingFiles.set(tempId, file)
    items.value.push({
      id: tempId,
      url: URL.createObjectURL(file),
      type: props.type,
      metadata: { name: file.name, size: file.size, mimeType: file.type || undefined },
      status: 'uploading',
      progress: 0
    })
    void uploadOne(tempId, file)
  }
}

/** 探测图片宽高 / 音视频时长（失败不阻断）。 */
function probeFile(file: File): Promise<{ width?: number, height?: number, duration?: number }> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (val: { width?: number, height?: number, duration?: number }) => {
      if (settled) return
      settled = true
      resolve(val)
    }
    const timer = setTimeout(() => finish({}), 5000)
    const objectUrl = URL.createObjectURL(file)

    if (file.type.startsWith('image/')) {
      const img = new Image()
      img.onload = () => {
        clearTimeout(timer)
        finish({ width: img.naturalWidth, height: img.naturalHeight })
        URL.revokeObjectURL(objectUrl)
      }
      img.onerror = () => {
        clearTimeout(timer)
        finish({})
        URL.revokeObjectURL(objectUrl)
      }
      img.src = objectUrl
      return
    }
    const tag = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : null
    if (!tag) {
      clearTimeout(timer)
      finish({})
      return
    }
    const el = document.createElement(tag)
    el.preload = 'metadata'
    el.onloadedmetadata = () => {
      clearTimeout(timer)
      const videoEl = tag === 'video' ? (el as HTMLVideoElement) : null
      finish({
        ...(videoEl ? { width: videoEl.videoWidth, height: videoEl.videoHeight } : {}),
        ...(Number.isFinite(el.duration) ? { duration: Math.round(el.duration) } : {})
      })
      URL.revokeObjectURL(objectUrl)
    }
    el.onerror = () => {
      clearTimeout(timer)
      finish({})
      URL.revokeObjectURL(objectUrl)
    }
    el.src = objectUrl
  })
}

interface CredentialResponse {
  code: 'OK'
  data: {
    credential: {
      tmpSecretId: string
      tmpSecretKey: string
      sessionToken: string
      startTime: number
      expiredTime: number
    }
    bucket: string
    region: string
    key: string
    url: string
  }
}

interface RegisterResponse {
  code: 'OK'
  data: MediaItem
}

async function uploadOne(tempId: string, file: File) {
  const index = items.value.findIndex(i => i.id === tempId)
  if (index < 0) return
  try {
    const credRes = await $fetch<CredentialResponse>('/api/media/credentials', {
      method: 'POST',
      credentials: 'include',
      body: {
        type: props.type,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
        filename: file.name
      }
    })
    const cred = credRes.data

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', cred.url)
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return
        const target = items.value.find(i => i.id === tempId)
        if (target) target.progress = Math.round((e.loaded / e.total) * 100)
      }
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)))
      xhr.onerror = () => reject(new Error('网络错误'))
      xhr.send(file)
    })

    const probed = await probeFile(file)
    const regRes = await $fetch<RegisterResponse>('/api/media/register', {
      method: 'POST',
      credentials: 'include',
      body: {
        key: cred.key,
        metadata: {
          name: file.name,
          ...(probed.width ? { width: probed.width } : {}),
          ...(probed.height ? { height: probed.height } : {}),
          ...(probed.duration ? { duration: probed.duration } : {})
        }
      }
    })

    const targetIndex = items.value.findIndex(i => i.id === tempId)
    if (targetIndex >= 0) {
      URL.revokeObjectURL(items.value[targetIndex]!.url)
      items.value[targetIndex] = { ...regRes.data, status: 'done', progress: 100 }
    }
    pendingFiles.delete(tempId)
  } catch (err) {
    const target = items.value.find(i => i.id === tempId)
    if (target) {
      target.status = 'error'
      target.errorMessage = apiErrorMessage(err, '上传失败')
    }
  }
}

function retry(tempId: string) {
  const file = pendingFiles.get(tempId)
  const target = items.value.find(i => i.id === tempId)
  if (!file || !target) return
  target.status = 'uploading'
  target.progress = 0
  target.errorMessage = undefined
  void uploadOne(tempId, file)
}

function removeItem(id: string) {
  const idx = items.value.findIndex(i => i.id === id)
  if (idx < 0) return
  const item = items.value[idx]!
  if (item.id.startsWith('local-')) URL.revokeObjectURL(item.url)
  pendingFiles.delete(id)
  items.value.splice(idx, 1)
}

// ---- 图片预览 ----
const previewOpen = ref(false)
const previewUrl = ref('')
function previewImage(item: MediaItem) {
  if (item.status !== 'done') return
  previewUrl.value = item.url
  previewOpen.value = true
}

const ui = computed(() => TYPE_UI[props.type])
</script>

<template>
  <div>
    <!-- 触发区 -->
    <div
      v-if="canAdd"
      role="button"
      tabindex="0"
      class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors"
      :class="dragOver
        ? 'border-primary bg-primary/5'
        : 'border-neutral-300 hover:border-primary dark:border-neutral-700'"
      @click="openPicker"
      @keydown.enter="openPicker"
      @dragover="onDragOver"
      @dragleave="dragOver = false"
      @drop="onDrop"
    >
      <UIcon
        name="i-lucide-cloud-upload"
        class="size-7 text-muted"
      />
      <span class="text-sm font-medium">
        {{ type === 'image' ? '上传图片' : type === 'video' ? '上传视频' : type === 'audio' ? '上传音频' : '上传文件' }}
      </span>
      <span class="text-xs text-muted">{{ ui.hint }}</span>
    </div>

    <!-- 图片：缩略图网格 -->
    <div
      v-if="type === 'image' && items.length"
      class="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6"
    >
      <div
        v-for="item in items"
        :key="item.id"
        class="group relative aspect-[4/3] overflow-hidden rounded-lg border"
        :class="item.status === 'error' ? 'border-error' : 'border-neutral-200 dark:border-neutral-700'"
      >
        <img
          v-if="item.status !== 'error'"
          :src="item.url"
          :alt="item.metadata.name || '预览'"
          class="size-full object-cover"
          :class="item.status === 'done' ? 'cursor-pointer' : ''"
          @click="previewImage(item)"
        >
        <div
          v-else
          class="flex size-full flex-col items-center justify-center gap-1 bg-error/5 px-1"
        >
          <UIcon
            name="i-lucide-circle-alert"
            class="size-5 text-error"
          />
          <button
            class="text-xs font-medium text-primary"
            @click.stop="retry(item.id)"
          >
            重试
          </button>
        </div>

        <!-- 上传进度遮罩 -->
        <div
          v-if="item.status === 'uploading'"
          class="absolute inset-0 flex items-center justify-center bg-black/40"
        >
          <span class="text-xs font-medium text-white">{{ item.progress ?? 0 }}%</span>
        </div>

        <button
          v-if="!disabled"
          class="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-white/90 text-neutral-600 opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="移除"
          @click.stop="removeItem(item.id)"
        >
          <UIcon
            name="i-lucide-x"
            class="size-3"
          />
        </button>
      </div>
    </div>

    <!-- 视频：播放器 -->
    <div
      v-if="type === 'video'"
      class="mt-4 space-y-3"
    >
      <div
        v-for="item in items"
        :key="item.id"
        class="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700"
      >
        <video
          v-if="item.status !== 'error'"
          :src="item.url"
          controls
          class="aspect-video w-full bg-black"
        />
        <div
          v-else
          class="flex items-center justify-between gap-2 bg-error/5 px-3 py-4"
        >
          <span class="flex items-center gap-2 text-sm text-error">
            <UIcon
              name="i-lucide-circle-alert"
              class="size-4"
            />{{ item.errorMessage || '上传失败' }}
          </span>
          <button
            class="text-xs font-medium text-primary"
            @click="retry(item.id)"
          >
            重试
          </button>
        </div>
        <div class="flex items-center justify-between gap-2 px-3 py-2">
          <span class="truncate text-xs text-muted">
            {{ item.metadata.name }} · {{ formatFileSize(item.metadata.size)
            }}<template v-if="item.metadata.duration"> · {{ item.metadata.duration }}s</template>
          </span>
          <UButton
            v-if="!disabled"
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-trash-2"
            label="移除"
            @click="removeItem(item.id)"
          />
        </div>
      </div>
    </div>

    <!-- 音频：播放条 -->
    <div
      v-if="type === 'audio'"
      class="mt-4 space-y-2"
    >
      <div
        v-for="item in items"
        :key="item.id"
        class="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-700"
      >
        <template v-if="item.status !== 'error'">
          <UIcon
            name="i-lucide-music"
            class="size-5 text-muted"
          />
          <audio
            :src="item.url"
            controls
            class="h-9 min-w-0 flex-1"
          />
        </template>
        <template v-else>
          <UIcon
            name="i-lucide-circle-alert"
            class="size-5 text-error"
          />
          <span class="flex-1 text-sm text-error">{{ item.errorMessage || '上传失败' }}</span>
          <button
            class="text-xs font-medium text-primary"
            @click="retry(item.id)"
          >
            重试
          </button>
        </template>
        <span class="w-full text-xs text-muted sm:w-auto sm:ml-auto">
          {{ item.metadata.name }} · {{ formatFileSize(item.metadata.size)
          }}<template v-if="item.metadata.duration"> · {{ item.metadata.duration }}s</template>
        </span>
        <UButton
          v-if="!disabled"
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-trash-2"
          @click="removeItem(item.id)"
        />
      </div>
    </div>

    <!-- 文件：列表行 -->
    <div
      v-if="type === 'file'"
      class="mt-4 space-y-2"
    >
      <div
        v-for="item in items"
        :key="item.id"
        class="flex items-center gap-3 rounded-lg border px-3 py-2"
        :class="item.status === 'error'
          ? 'border-error bg-error/5'
          : 'border-neutral-200 dark:border-neutral-700'"
      >
        <UIcon
          :name="item.status === 'error' ? 'i-lucide-circle-alert' : 'i-lucide-file-text'"
          class="size-5 shrink-0"
          :class="item.status === 'error' ? 'text-error' : 'text-muted'"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">
            {{ item.metadata.name || '未命名' }}
          </p>
          <p class="text-xs text-muted">
            {{ formatFileSize(item.metadata.size) }}
            <template v-if="item.status === 'uploading'">
              · 上传中 {{ item.progress ?? 0 }}%
            </template>
            <template v-else-if="item.status === 'error'">
              · {{ item.errorMessage || '上传失败' }}
            </template>
          </p>
        </div>
        <button
          v-if="item.status === 'error'"
          class="text-xs font-medium text-primary"
          @click="retry(item.id)"
        >
          重试
        </button>
        <UButton
          v-if="!disabled"
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-trash-2"
          @click="removeItem(item.id)"
        />
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      class="hidden"
      :accept="ui.accept"
      :multiple="multiple && maxCount !== 1"
      @change="onInputChange"
    >

    <!-- 图片大图预览 -->
    <UModal
      v-model:open="previewOpen"
      title="图片预览"
    >
      <template #body>
        <img
          :src="previewUrl"
          alt="预览"
          class="w-full rounded-lg object-contain"
        >
      </template>
    </UModal>
  </div>
</template>
