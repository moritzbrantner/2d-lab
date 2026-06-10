import type {
  VizAnyRenderLayer,
  VizCacheOptions,
  VizCacheStats,
  VizDatasetId,
  VizLayerId,
} from "./types";

export type VizRenderLayerCache<TProperties = Record<string, unknown>> = {
  clear(options?: { datasetId?: VizDatasetId; layerId?: VizLayerId }): void;
  deleteLayer(layerId: VizLayerId): void;
  get(query: VizRenderLayerCacheQuery): VizAnyRenderLayer<TProperties> | undefined;
  getStats(): VizCacheStats;
  set(query: VizRenderLayerCacheQuery, layer: VizAnyRenderLayer<TProperties>): number;
};

export type VizRenderLayerCacheQuery = {
  datasetId: string;
  datasetVersion: number;
  frameFormat: "objects" | "typed";
  layerId: VizLayerId;
  layerVersion: number;
  querySignature: string;
  viewportSignature: string;
};

type CacheEntry<TProperties> = VizRenderLayerCacheQuery & {
  lastAccess: number;
  layer: VizAnyRenderLayer<TProperties>;
};

const DEFAULT_MAX_LAYER_CACHE_ENTRIES = 8;

export function createRenderLayerCache<TProperties>(
  options: VizCacheOptions = {},
): VizRenderLayerCache<TProperties> {
  const enabled = options.enabled ?? true;
  const maxEntriesPerLayer = normalizeMaxEntries(
    options.maxEntriesPerLayer,
    DEFAULT_MAX_LAYER_CACHE_ENTRIES,
  );
  const maxTotalEntries =
    options.maxTotalEntries == null
      ? undefined
      : normalizeMaxEntries(options.maxTotalEntries, Number.POSITIVE_INFINITY);
  const layers = new Map<VizLayerId, Map<string, CacheEntry<TProperties>>>();
  let accessCounter = 0;
  let hitCount = 0;
  let missCount = 0;
  let evictionCount = 0;

  function evictLayerCacheEntries(layerCache: Map<string, CacheEntry<TProperties>>) {
    let evicted = 0;

    while (layerCache.size > maxEntriesPerLayer) {
      if (!deleteOldestEntry(layerCache)) {
        break;
      }
      evicted += 1;
    }

    evictionCount += evicted;
    return evicted;
  }

  function evictGlobalEntries() {
    if (maxTotalEntries == null) {
      return 0;
    }

    let evicted = 0;
    while (entryCount() > maxTotalEntries) {
      let oldestLayerId: VizLayerId | null = null;
      let oldestKey: string | null = null;
      let oldestAccess = Number.POSITIVE_INFINITY;

      for (const [layerId, layerCache] of layers) {
        for (const [key, entry] of layerCache) {
          if (entry.lastAccess < oldestAccess) {
            oldestAccess = entry.lastAccess;
            oldestLayerId = layerId;
            oldestKey = key;
          }
        }
      }

      if (oldestLayerId == null || oldestKey == null) {
        break;
      }

      const layerCache = layers.get(oldestLayerId);
      layerCache?.delete(oldestKey);
      if (layerCache?.size === 0) {
        layers.delete(oldestLayerId);
      }
      evicted += 1;
    }

    evictionCount += evicted;
    return evicted;
  }

  function entryCount() {
    let count = 0;
    for (const layerCache of layers.values()) {
      count += layerCache.size;
    }
    return count;
  }

  return {
    clear(clearOptions) {
      if (!clearOptions?.layerId && !clearOptions?.datasetId) {
        layers.clear();
        return;
      }

      if (clearOptions.layerId) {
        layers.delete(clearOptions.layerId);
        return;
      }

      for (const [layerId, layerCache] of layers) {
        for (const [key, entry] of layerCache) {
          if (entry.datasetId === clearOptions.datasetId) {
            layerCache.delete(key);
          }
        }
        if (layerCache.size === 0) {
          layers.delete(layerId);
        }
      }
    },

    deleteLayer(layerId: VizLayerId) {
      layers.delete(layerId);
    },

    get(query: VizRenderLayerCacheQuery) {
      if (!enabled) {
        missCount += 1;
        return undefined;
      }

      const layerCache = layers.get(query.layerId);
      const entry = layerCache?.get(cacheEntryKey(query));
      if (!entry || !cacheEntryMatches(entry, query)) {
        missCount += 1;
        return undefined;
      }

      hitCount += 1;
      entry.lastAccess = ++accessCounter;
      return entry.layer;
    },

    getStats() {
      return {
        enabled,
        entryCount: entryCount(),
        evictionCount,
        hitCount,
        layerCount: layers.size,
        maxEntriesPerLayer,
        maxTotalEntries,
        missCount,
      };
    },

    set(query: VizRenderLayerCacheQuery, layer: VizAnyRenderLayer<TProperties>) {
      if (!enabled || maxEntriesPerLayer <= 0 || maxTotalEntries === 0) {
        return 0;
      }

      const layerCache = layers.get(query.layerId) ?? new Map<string, CacheEntry<TProperties>>();
      layers.set(query.layerId, layerCache);
      layerCache.set(cacheEntryKey(query), {
        ...query,
        lastAccess: ++accessCounter,
        layer,
      });

      return evictLayerCacheEntries(layerCache) + evictGlobalEntries();
    },
  };
}

function cacheEntryKey(query: VizRenderLayerCacheQuery) {
  return [
    query.frameFormat,
    query.datasetVersion,
    query.layerVersion,
    query.viewportSignature,
    query.querySignature,
  ].join("\0");
}

function cacheEntryMatches<TProperties>(
  entry: CacheEntry<TProperties>,
  query: VizRenderLayerCacheQuery,
) {
  return (
    entry.datasetId === query.datasetId &&
    entry.datasetVersion === query.datasetVersion &&
    entry.frameFormat === query.frameFormat &&
    entry.layerId === query.layerId &&
    entry.layerVersion === query.layerVersion &&
    entry.querySignature === query.querySignature &&
    entry.viewportSignature === query.viewportSignature
  );
}

function deleteOldestEntry<TProperties>(layerCache: Map<string, CacheEntry<TProperties>>) {
  let oldestKey: string | null = null;
  let oldestAccess = Number.POSITIVE_INFINITY;

  for (const [key, entry] of layerCache) {
    if (entry.lastAccess < oldestAccess) {
      oldestAccess = entry.lastAccess;
      oldestKey = key;
    }
  }

  if (oldestKey == null) {
    return false;
  }

  layerCache.delete(oldestKey);
  return true;
}

function normalizeMaxEntries(value: number | undefined, fallback: number) {
  if (value == null) {
    return fallback;
  }

  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
}
