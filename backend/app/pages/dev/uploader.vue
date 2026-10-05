<script setup lang="ts">
import type { MediaItem } from '~/components/MediaUploader.vue'

const imageItems = ref<MediaItem[]>([])
const videoItems = ref<MediaItem[]>([])
const audioItems = ref<MediaItem[]>([])
const fileItems = ref<MediaItem[]>([])
const multiImageItems = ref<MediaItem[]>([])
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6">
    <div>
      <h1 class="text-xl font-semibold">
        上传组件验证页（临时）
      </h1>
      <p class="mt-1 text-sm text-muted">
        验证后删除本页面
      </p>
    </div>

    <UCard>
      <template #header>
        图片（单传）
      </template>
      <MediaUploader
        v-model="imageItems"
        type="image"
      />
    </UCard>

    <UCard>
      <template #header>
        图片（多传，最多 6 张）
      </template>
      <MediaUploader
        v-model="multiImageItems"
        type="image"
        multiple
        :max-count="6"
      />
    </UCard>

    <UCard>
      <template #header>
        视频（单传）
      </template>
      <MediaUploader
        v-model="videoItems"
        type="video"
      />
    </UCard>

    <UCard>
      <template #header>
        音频（单传）
      </template>
      <MediaUploader
        v-model="audioItems"
        type="audio"
      />
    </UCard>

    <UCard>
      <template #header>
        文件（单传）
      </template>
      <MediaUploader
        v-model="fileItems"
        type="file"
      />
    </UCard>
  </div>
</template>
