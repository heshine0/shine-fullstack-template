<script setup lang="ts">
import { Extension, Node, mergeAttributes, type ChainedCommands, type CommandProps } from '@tiptap/core'
import type { Editor as TiptapEditor } from '@tiptap/vue-3'
import { Color } from '@tiptap/extension-color'
import { FontFamily } from '@tiptap/extension-font-family'
import { Highlight } from '@tiptap/extension-highlight'
import { TextAlign } from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { uploadMediaFile } from '~/utils/editor-media'
import { useEditorBridge } from '~/composables/useEditorBridge'

definePageMeta({ layout: false })

// ===== 自定义 Tiptap 扩展 =====

const Video = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      src: { default: null },
      controls: { default: true }
    }
  },
  parseHTML() {
    return [{ tag: 'video' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['video', mergeAttributes(HTMLAttributes, {
      controls: true, playsinline: true, style: 'max-width:100%'
    })]
  }
})

const Audio = Node.create({
  name: 'audio',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      src: { default: null },
      controls: { default: true }
    }
  },
  parseHTML() {
    return [{ tag: 'audio' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['audio', mergeAttributes(HTMLAttributes, { controls: true, style: 'width:100%' })]
  }
})

const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return { types: ['textStyle'] }
  },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.fontSize || null,
          renderHTML: attributes =>
            typeof attributes.fontSize === 'string' && attributes.fontSize
              ? { style: `font-size: ${attributes.fontSize}` }
              : {}
        }
      }
    }]
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }: CommandProps) =>
        chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }: CommandProps) =>
        chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
    }
  }
})

// ===== 草稿管理 =====
const route = useRoute()
const draftId = computed(() => (route.query.draft as string) || '')
const html = ref('')
const editorRef = ref<{ editor?: TiptapEditor } | null>(null)
const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
let saveTimer: ReturnType<typeof setTimeout> | null = null

const extensions = [
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  FontFamily,
  FontSize,
  Video,
  Audio
]

const bridge = useEditorBridge()
const toast = useToast()

onMounted(async () => {
  if (draftId.value) {
    try {
      // 后端统一信封：{ code:'OK', data:{ id, content, updatedAt } }
      const resp = await $fetch<{ code: string, data: { content: string } }>(
        `/api/editor/drafts/${draftId.value}`,
        { credentials: 'include' }
      )
      html.value = resp.data?.content ?? ''
    } catch {
      // 草稿不存在或过期，使用空内容
      html.value = ''
    }
  }
  bridge.postMessage({ type: 'ready' })
})

watch(html, () => {
  if (!draftId.value) return
  if (saveTimer) clearTimeout(saveTimer)
  saveStatus.value = 'saving'
  saveTimer = setTimeout(async () => {
    try {
      await $fetch(`/api/editor/drafts/${draftId.value}`, {
        method: 'PUT',
        body: { content: html.value },
        credentials: 'include'
      })
      saveStatus.value = 'saved'
      bridge.postMessage({ type: 'update', html: html.value })
    } catch {
      saveStatus.value = 'error'
    }
  }, 1000)
})

async function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (!draftId.value) return
  try {
    await $fetch(`/api/editor/drafts/${draftId.value}`, {
      method: 'PUT',
      body: { content: html.value },
      credentials: 'include'
    })
    saveStatus.value = 'saved'
  } catch {
    saveStatus.value = 'error'
  }
}

async function onComplete() {
  await flushSave()
  bridge.done({ draftId: draftId.value, html: html.value })
}

function onCancel() {
  bridge.cancel()
}

// ===== 媒体上传 =====
async function handleFileSelect(type: 'image' | 'video' | 'audio') {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : 'audio/*'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const result = await uploadMediaFile(file, type)
      const editor = editorRef.value?.editor
      if (!editor) return
      if (type === 'image') {
        editor.chain().focus().setImage({ src: result.url }).run()
      } else if (type === 'video') {
        editor.chain().focus().insertContent({ type: 'video', attrs: { src: result.url } }).run()
      } else {
        editor.chain().focus().insertContent({ type: 'audio', attrs: { src: result.url } }).run()
      }
    } catch (err) {
      toast.add({ title: '上传失败', description: String(err), color: 'error' })
    }
  }
  input.click()
}

// ===== 链接插入 =====
function insertLink() {
  const editor = editorRef.value?.editor
  if (!editor) return
  const raw = window.prompt('输入链接地址（仅支持 http(s)://、mailto:、tel:）')
  if (raw === null) return
  const href = normalizeLinkUrl(raw)
  if (!href) {
    toast.add({ title: '链接地址不合法', description: '仅支持 http(s)://、mailto:、tel:', color: 'error' })
    return
  }
  // 内容契约：外链一律新标签打开并切断 window.opener
  editor.chain().focus().setLink({
    href,
    target: '_blank',
    rel: 'noopener noreferrer'
  }).run()
}

// ===== 工具栏辅助 =====
function exec(fn: (chain: ChainedCommands) => unknown) {
  const editor = editorRef.value?.editor
  if (!editor) return
  fn(editor.chain().focus())
}

// Nuxt UI v4 USelect 选项 value 不允许空字符串，「默认」用哨兵值，选中后 unsetFontFamily
const fontFamilies = [
  { label: '默认', value: 'default' },
  { label: '衬线', value: 'serif' },
  { label: '等宽', value: 'monospace' }
]

const fontSizes = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px']

function onFontFamilyChange(value: string) {
  const editor = editorRef.value?.editor
  if (!editor) return
  if (value === 'default') {
    editor.chain().focus().unsetFontFamily().run()
  } else {
    editor.chain().focus().setFontFamily(value).run()
  }
}

function onFontSizeChange(value: string) {
  const editor = editorRef.value?.editor
  if (!editor) return
  editor.chain().focus().setFontSize(value).run()
}

const colors = [
  '#000000', '#444444', '#888888', '#cccccc', '#ffffff',
  '#ff0000', '#ff8800', '#ffff00', '#00cc00', '#0088ff',
  '#0000ff', '#8800ff', '#ff0088', '#884400', '#008888'
]

const savedTime = computed(() => {
  if (saveStatus.value !== 'saved') return ''
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
})
</script>

<template>
  <div class="min-h-screen flex flex-col bg-white">
    <!-- 吸顶工具栏 -->
    <div class="sticky top-0 z-10 border-b bg-white px-2 py-1 flex flex-wrap items-center gap-1">
      <UButton
        icon="i-lucide-undo"
        variant="ghost"
        size="xs"
        @click="exec(c => c.undo().run())"
      />
      <UButton
        icon="i-lucide-redo"
        variant="ghost"
        size="xs"
        @click="exec(c => c.redo().run())"
      />
      <USeparator orientation="vertical" />
      <UButton
        label="H1"
        variant="ghost"
        size="xs"
        @click="exec(c => c.toggleHeading({ level: 1 }).run())"
      />
      <UButton
        label="H2"
        variant="ghost"
        size="xs"
        @click="exec(c => c.toggleHeading({ level: 2 }).run())"
      />
      <UButton
        label="H3"
        variant="ghost"
        size="xs"
        @click="exec(c => c.toggleHeading({ level: 3 }).run())"
      />
      <USeparator orientation="vertical" />
      <USelect
        :items="fontFamilies"
        size="xs"
        placeholder="字体"
        @update:model-value="onFontFamilyChange"
      />
      <USelect
        :items="fontSizes"
        size="xs"
        placeholder="字号"
        @update:model-value="onFontSizeChange"
      />
      <USeparator orientation="vertical" />
      <UButton
        icon="i-lucide-bold"
        variant="ghost"
        size="xs"
        @click="exec(c => c.toggleBold().run())"
      />
      <UButton
        icon="i-lucide-italic"
        variant="ghost"
        size="xs"
        @click="exec(c => c.toggleItalic().run())"
      />
      <UButton
        icon="i-lucide-underline"
        variant="ghost"
        size="xs"
        @click="exec(c => c.toggleUnderline().run())"
      />
      <UButton
        icon="i-lucide-strikethrough"
        variant="ghost"
        size="xs"
        @click="exec(c => c.toggleStrike().run())"
      />
      <USeparator orientation="vertical" />
      <UPopover>
        <UButton
          icon="i-lucide-palette"
          variant="ghost"
          size="xs"
        />
        <template #content>
          <div class="grid grid-cols-5 gap-1 p-2">
            <UButton
              v-for="color in colors"
              :key="color"
              :style="{ backgroundColor: color }"
              size="xs"
              @click="exec(c => c.setColor(color).run())"
            />
          </div>
        </template>
      </UPopover>
      <UPopover>
        <UButton
          icon="i-lucide-highlighter"
          variant="ghost"
          size="xs"
        />
        <template #content>
          <div class="grid grid-cols-5 gap-1 p-2">
            <UButton
              v-for="color in colors"
              :key="color"
              :style="{ backgroundColor: color }"
              size="xs"
              @click="exec(c => c.toggleHighlight({ color }).run())"
            />
          </div>
        </template>
      </UPopover>
      <USeparator orientation="vertical" />
      <UButton
        icon="i-lucide-align-left"
        variant="ghost"
        size="xs"
        @click="exec(c => c.setTextAlign('left').run())"
      />
      <UButton
        icon="i-lucide-align-center"
        variant="ghost"
        size="xs"
        @click="exec(c => c.setTextAlign('center').run())"
      />
      <UButton
        icon="i-lucide-align-right"
        variant="ghost"
        size="xs"
        @click="exec(c => c.setTextAlign('right').run())"
      />
      <UButton
        icon="i-lucide-align-justify"
        variant="ghost"
        size="xs"
        @click="exec(c => c.setTextAlign('justify').run())"
      />
      <USeparator orientation="vertical" />
      <UButton
        icon="i-lucide-list"
        variant="ghost"
        size="xs"
        @click="exec(c => c.toggleBulletList().run())"
      />
      <UButton
        icon="i-lucide-list-ordered"
        variant="ghost"
        size="xs"
        @click="exec(c => c.toggleOrderedList().run())"
      />
      <USeparator orientation="vertical" />
      <UButton
        icon="i-lucide-link"
        variant="ghost"
        size="xs"
        @click="insertLink"
      />
      <UButton
        icon="i-lucide-image"
        variant="ghost"
        size="xs"
        @click="handleFileSelect('image')"
      />
      <UButton
        icon="i-lucide-video"
        variant="ghost"
        size="xs"
        @click="handleFileSelect('video')"
      />
      <UButton
        icon="i-lucide-music"
        variant="ghost"
        size="xs"
        @click="handleFileSelect('audio')"
      />
      <USeparator orientation="vertical" />
      <UButton
        icon="i-lucide-eraser"
        variant="ghost"
        size="xs"
        @click="exec(c => c.unsetAllMarks().clearNodes().run())"
      />
    </div>

    <!-- 编辑器 -->
    <div class="flex-1 overflow-auto">
      <ClientOnly>
        <UEditor
          ref="editorRef"
          v-model="html"
          content-type="html"
          :extensions="extensions"
          :starter-kit="{ link: { openOnClick: false } }"
          class="max-w-none p-4"
        />
        <template #fallback>
          <div class="flex items-center justify-center py-20">
            <UIcon
              name="i-lucide-loader-circle"
              class="size-8 animate-spin text-primary"
            />
          </div>
        </template>
      </ClientOnly>
    </div>

    <!-- 底部操作栏 -->
    <div class="sticky bottom-0 z-10 border-t bg-white px-4 py-2 flex items-center justify-between">
      <UButton
        label="取消"
        variant="ghost"
        @click="onCancel"
      />
      <span class="text-sm text-gray-500">
        {{ saveStatus === 'saving' ? '保存中…' : saveStatus === 'saved' ? `已保存 ${savedTime}` : saveStatus === 'error' ? '未保存' : '' }}
      </span>
      <UButton
        label="完成"
        color="primary"
        @click="onComplete"
      />
    </div>
  </div>
</template>
