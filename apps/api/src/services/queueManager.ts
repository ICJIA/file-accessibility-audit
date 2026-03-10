import fs from 'node:fs'
import { BATCH_QUEUE } from '#config'
import { analyzePDF } from './pdfAnalyzer.js'
import { emitQueueItemDeleted, emitQueueItemUpsert } from './queueEvents.js'
import {
  countProcessingItems,
  getQueueItemById,
  listProcessingItems,
  nextQueuedItems,
  nowIso,
  QueueItemRecord,
  updateQueueItem,
} from './queueStore.js'

const activeControllers = new Map<string, AbortController>()

async function processQueueItem(item: QueueItemRecord): Promise<void> {
  const controller = new AbortController()
  activeControllers.set(item.id, controller)

  updateQueueItem(item.id, {
    state: 'processing',
    processing_progress: 1,
    processing_stage: 'Preparing analysis',
    upload_progress: 100,
    processing_started_at: nowIso(),
    completed_at: null,
    error_json: null,
  })
  emitQueueItemUpsert(item.id)

  try {
    if (!item.storage_path || !fs.existsSync(item.storage_path)) {
      throw new Error('Stored PDF file is missing.')
    }

    const buffer = await fs.promises.readFile(item.storage_path)
    const result = await analyzePDF(buffer, item.filename, {
      signal: controller.signal,
      onProgress(progress) {
        updateQueueItem(item.id, {
          processing_progress: progress.percent,
          processing_stage: progress.stage,
        })
        emitQueueItemUpsert(item.id)
      },
    })

    updateQueueItem(item.id, {
      state: 'complete',
      processing_progress: 100,
      processing_stage: 'Complete',
      result_json: JSON.stringify(result),
      error_json: null,
      page_count: result.pageCount,
      overall_score: result.overallScore,
      grade: result.grade,
      completed_at: nowIso(),
    })
    emitQueueItemUpsert(item.id)
  } catch (err: any) {
    if (controller.signal.aborted) {
      updateQueueItem(item.id, {
        state: 'cancelled',
        processing_progress: 0,
        processing_stage: 'Cancelled',
        error_json: JSON.stringify({ error: 'Processing cancelled.' }),
        completed_at: nowIso(),
      })
      emitQueueItemUpsert(item.id)
      return
    }

    updateQueueItem(item.id, {
      state: 'failed',
      processing_stage: 'Failed',
      error_json: JSON.stringify(err?.data || { error: err?.message || 'Processing failed.' }),
      completed_at: nowIso(),
    })
    emitQueueItemUpsert(item.id)
  } finally {
    activeControllers.delete(item.id)
    scheduleClient(item.client_id)
  }
}

export function scheduleClient(clientId: string): void {
  const active = listProcessingItems(clientId).length
  const available = Math.max(0, BATCH_QUEUE.MAX_PARALLEL_PER_CLIENT - active)
  if (!available) return

  const queued = nextQueuedItems(clientId, available)
  for (const item of queued) {
    void processQueueItem(item)
  }
}

export function queueItemForProcessing(itemId: string): void {
  const item = getQueueItemById(itemId)
  if (!item || item.hidden || item.state !== 'queued') return
  scheduleClient(item.client_id)
}

export function cancelQueueItem(itemId: string): { changed: boolean; clientId?: string } {
  const item = getQueueItemById(itemId)
  if (!item || item.hidden) return { changed: false }

  const controller = activeControllers.get(itemId)
  if (controller) {
    controller.abort()
    return { changed: true, clientId: item.client_id }
  }

  if (item.state === 'uploading' || item.state === 'queued') {
    updateQueueItem(itemId, {
      state: 'cancelled',
      processing_stage: 'Cancelled',
      completed_at: nowIso(),
      error_json: JSON.stringify({ error: 'Processing cancelled.' }),
    })
    emitQueueItemUpsert(itemId)
    return { changed: true, clientId: item.client_id }
  }

  return { changed: false, clientId: item.client_id }
}

export function removeQueueItemFromStreams(itemId: string): void {
  const item = getQueueItemById(itemId)
  if (!item) return
  emitQueueItemDeleted(item.client_id, itemId)
}

export function getActiveUploadCount(_clientId: string): number {
  return 0
}
