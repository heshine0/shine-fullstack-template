<script setup lang="ts">
type MediaType = 'image' | 'video' | 'audio' | 'file'

interface MediaRow {
  id: string
  url: string
  type: MediaType
  refCount: number
  metadata: {
    name?: string
    size?: number
    mimeType?: string
    width?: number
    height?: number
    duration?: number
  }
  createdAt: string
}
interface ListResponse {
  code: 'OK'
  data: MediaRow[]
  pagination: { page: number, pageSize: number, total: number, totalPages: number }
}

const toast = useToast()

// 列表状态
const rows = ref<MediaRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const searchInput = ref('')
const keyword = ref('')
const typeFilter = ref<MediaType | 'all'>('all')

const typeOptions = [
  { label: '全部类型', value: 'all' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
  { label: '音频', value: 'audio' },
  { label: '其他文件', value: 'file' }
]

async function load() {
  loading.value = true
  try {
    const res = await $fetch<ListResponse>('/api/admin/media', {
      credentials: 'include',
      query: {
        page: page.value,
        pageSize,
        ...(typeFilter.value !== 'all' ? { type: typeFilter.value } : {}),
        ...(keyword.value ? { keyword: keyword.value } : {})
      }
    })
    rows.value = res.data
    total.value = res.pagination.total
  } catch (err) {
    toast.add({ title: apiErrorMessage(err, '加载媒体列表失败'), color: 'error' })
  } finally {
    loading.value = false
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchInput, (val) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    keyword.value = val.trim()
    page.value = 1
    load()
  }, 300)
})

watch(typeFilter, () => {
  page.value = 1
  load()
})
watch(page, () => load())

const columns = [
  { id: 'preview', header: '预览' },
  { accessorKey: 'type', header: '类型' },
  { id: 'name', header: '文件 / URL' },
  { id: 'size', header: '大小' },
  { accessorKey: 'refCount', header: '引用数' },
  { accessorKey: 'createdAt', header: '创建时间' },
  { id: 'actions', header: '操作' }
]

const typeMeta: Record<MediaType, { label: string, icon: string, color: string }> = {
  image: { label: '图片', icon: 'i-lucide-image', color: 'primary' },
  video: { label: '视频', icon: 'i-lucide-film', color: 'warning' },
  audio: { label: '音频', icon: 'i-lucide-music', color: 'success' },
  file: { label: '文件', icon: 'i-lucide-file', color: 'neutral' }
}

function dimensionsText(row: MediaRow): string {
  const { width, height, duration } = row.metadata
  const parts: string[] = []
  if (width && height) parts.push(`${width}×${height}`)
  if (duration) parts.push(`${duration}s`)
  return parts.join(' · ')
}

// 删除确认
const deleteOpen = ref(false)
const deleteTarget = ref<MediaRow | null>(null)
const deleteSubmitting = ref(false)

function askDelete(row: MediaRow) {
  deleteTarget.value = row
  deleteOpen.value = true
}

async function onDelete() {
  if (!deleteTarget.value) return
  deleteSubmitting.value = true
  try {
    await $fetch(`/api/admin/media/${deleteTarget.value.id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    toast.add({ title: '媒体已删除', color: 'success' })
    deleteOpen.value = false
    // 删完最后一页最后一条时回退一页
    if (rows.value.length === 1 && page.value > 1) page.value -= 1
    else await load()
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    deleteSubmitting.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">
          媒体管理
        </h1>
        <p class="text-sm text-muted mt-1">
          共 {{ total }} 个媒体文件
        </p>
      </div>
      <div class="flex items-center gap-2">
        <USelect
          v-model="typeFilter"
          :items="typeOptions"
          class="w-32"
        />
        <UInput
          v-model="searchInput"
          placeholder="搜索 URL / 文件名"
          icon="i-lucide-search"
          class="w-56 sm:w-64"
          clearable
        />
      </div>
    </div>

    <UCard>
      <UTable
        :data="rows"
        :columns="columns"
        :loading="loading"
      >
        <template #preview-cell="{ row }">
          <div class="flex h-10 items-center">
            <img
              v-if="row.original.type === 'image'"
              :src="row.original.url"
              alt="预览"
              class="h-10 w-10 rounded object-cover"
            >
            <UIcon
              v-else
              :name="typeMeta[row.original.type as MediaType].icon"
              class="size-6 text-muted"
            />
          </div>
        </template>

        <template #type-cell="{ row }">
          <UBadge
            :color="typeMeta[row.original.type as MediaType].color as any"
            variant="subtle"
            size="sm"
          >
            {{ typeMeta[row.original.type as MediaType].label }}
          </UBadge>
        </template>

        <template #name-cell="{ row }">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">
              {{ row.original.metadata.name || '未命名' }}
            </p>
            <a
              :href="row.original.url"
              target="_blank"
              rel="noopener"
              class="block max-w-80 truncate text-xs text-muted underline-offset-2 hover:underline"
            >
              {{ row.original.url }}
            </a>
          </div>
        </template>

        <template #size-cell="{ row }">
          <div class="text-sm">
            {{ formatFileSize(row.original.metadata.size) }}
            <p
              v-if="dimensionsText(row.original)"
              class="text-xs text-muted"
            >
              {{ dimensionsText(row.original) }}
            </p>
          </div>
        </template>

        <template #refCount-cell="{ row }">
          <span
            class="text-sm"
            :class="row.original.refCount > 0 ? 'font-medium' : 'text-muted'"
          >
            {{ row.original.refCount }}
          </span>
        </template>

        <template #createdAt-cell="{ row }">
          <span class="text-sm text-muted">{{ formatDateTime(row.original.createdAt) }}</span>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end">
            <UButton
              color="error"
              variant="ghost"
              size="xs"
              icon="i-lucide-trash-2"
              label="删除"
              @click="askDelete(row.original)"
            />
          </div>
        </template>

        <template #empty>
          <div class="py-10 text-center text-sm text-muted">
            暂无媒体数据
          </div>
        </template>
      </UTable>

      <div
        v-if="total > pageSize"
        class="mt-4 flex justify-center"
      >
        <UPagination
          v-model:page="page"
          :total="total"
          :items-per-page="pageSize"
        />
      </div>
    </UCard>

    <!-- 删除确认 -->
    <UModal
      v-model:open="deleteOpen"
      title="删除媒体"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-sm">
            确定要删除该媒体吗？COS 上的对象与数据库记录将一并删除，此操作不可恢复。
          </p>
          <div class="rounded-md bg-muted/40 p-3">
            <p class="truncate text-sm font-medium">
              {{ deleteTarget?.metadata.name || '未命名' }}
            </p>
            <p class="mt-1 truncate text-xs text-muted">
              {{ deleteTarget?.url }}
            </p>
          </div>
          <div class="flex w-full justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              label="取消"
              @click="deleteOpen = false"
            />
            <UButton
              color="error"
              label="确认删除"
              :loading="deleteSubmitting"
              @click="onDelete"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
