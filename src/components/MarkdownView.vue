<script setup lang="ts">
import { computed } from "vue";
import { marked } from "marked";

const props = defineProps<{
  content: string;
}>();

marked.setOptions({
  gfm: true,
  breaks: true,
});

const renderedHtml = computed(() => {
  if (!props.content) return "";
  try {
    return marked.parse(props.content, { async: false }) as string;
  } catch {
    return props.content;
  }
});
</script>

<template>
  <div class="markdown-body text-[13px] leading-relaxed text-fg select-text" v-html="renderedHtml" />
</template>

<style scoped>
.markdown-body :deep(h1) {
  font-size: 16px;
  font-weight: 700;
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
  color: var(--color-fg);
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--color-border);
}
.markdown-body :deep(h1:first-child) {
  margin-top: 0;
}

.markdown-body :deep(h2) {
  font-size: 14.5px;
  font-weight: 700;
  margin-top: 1.25rem;
  margin-bottom: 0.4rem;
  color: var(--color-fg);
}

.markdown-body :deep(h3) {
  font-size: 13.5px;
  font-weight: 600;
  margin-top: 1rem;
  margin-bottom: 0.35rem;
  color: var(--color-fg);
}

.markdown-body :deep(h4) {
  font-size: 12.5px;
  font-weight: 600;
  margin-top: 0.75rem;
  margin-bottom: 0.25rem;
  color: var(--color-fg);
}

.markdown-body :deep(p) {
  margin-top: 0.4rem;
  margin-bottom: 0.6rem;
  color: var(--color-muted);
  line-height: 1.6;
}

.markdown-body :deep(strong) {
  color: var(--color-fg);
  font-weight: 600;
}

.markdown-body :deep(ul) {
  list-style-type: disc;
  padding-left: 1.25rem;
  margin-top: 0.35rem;
  margin-bottom: 0.6rem;
  color: var(--color-muted);
}

.markdown-body :deep(ol) {
  list-style-type: decimal;
  padding-left: 1.25rem;
  margin-top: 0.35rem;
  margin-bottom: 0.6rem;
  color: var(--color-muted);
}

.markdown-body :deep(li) {
  margin-top: 0.2rem;
  margin-bottom: 0.2rem;
  line-height: 1.55;
}

.markdown-body :deep(code) {
  font-family: var(--font-mono);
  font-size: 11.5px;
  background-color: var(--color-panel);
  border: 1px solid var(--color-border);
  padding: 0.15rem 0.35rem;
  border-radius: 5px;
  color: var(--color-fg);
}

.markdown-body :deep(pre) {
  background-color: var(--color-panel);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0.75rem 1rem;
  margin-top: 0.5rem;
  margin-bottom: 0.75rem;
  overflow-x: auto;
}

.markdown-body :deep(pre code) {
  background-color: transparent;
  border: none;
  padding: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--color-fg);
  display: block;
  white-space: pre;
}

.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin-top: 0.6rem;
  margin-bottom: 0.85rem;
  font-size: 12px;
  display: block;
  overflow-x: auto;
}

.markdown-body :deep(th) {
  background-color: var(--color-panel);
  border: 1px solid var(--color-border);
  padding: 0.45rem 0.65rem;
  text-align: left;
  font-weight: 600;
  color: var(--color-fg);
}

.markdown-body :deep(td) {
  border: 1px solid var(--color-border);
  padding: 0.45rem 0.65rem;
  color: var(--color-muted);
  vertical-align: top;
}

.markdown-body :deep(tr:nth-child(even) td) {
  background-color: rgba(125, 125, 125, 0.03);
}

.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--color-primary);
  padding-left: 0.75rem;
  margin-left: 0;
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
  color: var(--color-muted);
  font-style: italic;
}

.markdown-body :deep(a) {
  color: var(--color-primary);
  text-decoration: none;
}
.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 1rem 0;
}
</style>
