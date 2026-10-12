#include "../include/rolling_buffer.h"
#include <stdlib.h>
#include <string.h>

// If compiled under ESP-IDF, these macros map to heap_caps_malloc.
// In standard C / unit tests, they fall back to standard malloc.
#if defined(ESP_PLATFORM)
#include "esp_heap_caps.h"
#include "esp_psram.h"
#define APEX_ALLOC_PSRAM(size) heap_caps_malloc(size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)
#define APEX_ALLOC_INTERNAL(size) heap_caps_malloc(size, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT)
#else
#define APEX_ALLOC_PSRAM(size) NULL
#define APEX_ALLOC_INTERNAL(size) malloc(size)
#endif

static apex_telemetry_sample_t *s_ring_buffer = NULL;
static apex_buffer_status_t s_status = {0};

int apex_rolling_buffer_init(uint32_t target_rate_hz) {
    if (target_rate_hz == 0) target_rate_hz = APEX_DEFAULT_SAMPLE_RATE_HZ;

    uint32_t needed_samples = APEX_BUFFER_MAX_DURATION_SEC * target_rate_hz;
    size_t needed_bytes = needed_samples * sizeof(apex_telemetry_sample_t);

    // Try allocating in external PSRAM first
    s_ring_buffer = (apex_telemetry_sample_t *)APEX_ALLOC_PSRAM(needed_bytes);
    if (s_ring_buffer != NULL) {
        s_status.is_psram_allocated = true;
        s_status.capacity_samples = needed_samples;
        s_status.allocated_bytes = needed_bytes;
    } else {
        // Fallback: Allocate bounded internal SRAM (e.g. 60 seconds if 300s doesn't fit)
        s_status.is_psram_allocated = false;
        s_ring_buffer = (apex_telemetry_sample_t *)APEX_ALLOC_INTERNAL(needed_bytes);
        if (s_ring_buffer != NULL) {
            s_status.capacity_samples = needed_samples;
            s_status.allocated_bytes = needed_bytes;
        } else {
            // Further fallback to 60-second capacity in internal SRAM
            uint32_t fallback_samples = 60 * target_rate_hz;
            size_t fallback_bytes = fallback_samples * sizeof(apex_telemetry_sample_t);
            s_ring_buffer = (apex_telemetry_sample_t *)APEX_ALLOC_INTERNAL(fallback_bytes);
            if (!s_ring_buffer) return -1; // Out of memory

            s_status.capacity_samples = fallback_samples;
            s_status.allocated_bytes = fallback_bytes;
        }
    }

    s_status.current_samples = 0;
    s_status.head_index = 0;
    s_status.tail_index = 0;
    s_status.dropped_samples = 0;
    s_status.oldest_timestamp_us = 0;
    s_status.newest_timestamp_us = 0;

    return 0;
}

int apex_rolling_buffer_push(const apex_telemetry_sample_t *sample) {
    if (!s_ring_buffer || !sample) return -1;

    s_ring_buffer[s_status.head_index] = *sample;
    s_status.newest_timestamp_us = sample->timestamp_us;

    if (s_status.current_samples < s_status.capacity_samples) {
        if (s_status.current_samples == 0) {
            s_status.oldest_timestamp_us = sample->timestamp_us;
        }
        s_status.current_samples++;
    } else {
        // Buffer full: advance tail and increment drop counter
        s_status.tail_index = (s_status.tail_index + 1) % s_status.capacity_samples;
        s_status.dropped_samples++;
        s_status.oldest_timestamp_us = s_ring_buffer[s_status.tail_index].timestamp_us;
    }

    s_status.head_index = (s_status.head_index + 1) % s_status.capacity_samples;
    return 0;
}

int apex_rolling_buffer_snapshot(uint32_t duration_sec, apex_buffer_snapshot_t *out_snapshot) {
    if (!s_ring_buffer || !out_snapshot) return -1;
    if (s_status.current_samples == 0) {
        memset(out_snapshot, 0, sizeof(*out_snapshot));
        return 0;
    }

    uint64_t duration_us = (uint64_t)duration_sec * 1000000ULL;
    uint64_t cutoff_us = 0;
    if (s_status.newest_timestamp_us > duration_us) {
        cutoff_us = s_status.newest_timestamp_us - duration_us;
    }

    // Count qualifying samples starting from tail
    uint32_t count = 0;
    for (uint32_t i = 0; i < s_status.current_samples; i++) {
        uint32_t idx = (s_status.tail_index + i) % s_status.capacity_samples;
        if (s_ring_buffer[idx].timestamp_us >= cutoff_us) {
            count++;
        }
    }

    if (count == 0) {
        memset(out_snapshot, 0, sizeof(*out_snapshot));
        return 0;
    }

    apex_telemetry_sample_t *buf = (apex_telemetry_sample_t *)malloc(count * sizeof(apex_telemetry_sample_t));
    if (!buf) return -2;

    uint32_t write_idx = 0;
    uint32_t gaps = 0;
    uint32_t last_seq = 0;
    bool has_seq = false;

    for (uint32_t i = 0; i < s_status.current_samples; i++) {
        uint32_t idx = (s_status.tail_index + i) % s_status.capacity_samples;
        if (s_ring_buffer[idx].timestamp_us >= cutoff_us) {
            buf[write_idx] = s_ring_buffer[idx];
            if (has_seq) {
                if (buf[write_idx].sequence_number > last_seq + 1) {
                    gaps += (buf[write_idx].sequence_number - last_seq - 1);
                }
            }
            last_seq = buf[write_idx].sequence_number;
            has_seq = true;
            write_idx++;
        }
    }

    out_snapshot->requested_duration_sec = duration_sec;
    out_snapshot->sample_count = count;
    out_snapshot->sequence_gaps_detected = gaps;
    out_snapshot->start_timestamp_us = buf[0].timestamp_us;
    out_snapshot->end_timestamp_us = buf[count - 1].timestamp_us;
    out_snapshot->actual_duration_sec = (float)(out_snapshot->end_timestamp_us - out_snapshot->start_timestamp_us) / 1000000.0f;
    out_snapshot->samples = buf;

    return 0;
}

void apex_rolling_buffer_free_snapshot(apex_buffer_snapshot_t *snapshot) {
    if (snapshot && snapshot->samples) {
        free(snapshot->samples);
        snapshot->samples = NULL;
    }
}

void apex_rolling_buffer_get_status(apex_buffer_status_t *status) {
    if (status) {
        *status = s_status;
    }
}
