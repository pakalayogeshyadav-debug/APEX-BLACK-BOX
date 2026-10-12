#ifndef APEX_ROLLING_BUFFER_H
#define APEX_ROLLING_BUFFER_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "can_frame.h"

#ifdef __cplusplus
extern "C" {
#endif

#define APEX_BUFFER_MAX_DURATION_SEC 300  /**< 5-minute rolling window */
#define APEX_DEFAULT_SAMPLE_RATE_HZ   50   /**< 50 Hz telemetry sampling */
#define APEX_MAX_SAMPLES (APEX_BUFFER_MAX_DURATION_SEC * APEX_DEFAULT_SAMPLE_RATE_HZ) /**< 15,000 samples */

typedef struct {
    uint32_t capacity_samples;     /**< Total allocated sample slots */
    uint32_t current_samples;      /**< Current number of valid samples stored */
    uint32_t head_index;           /**< Index where next sample will be written */
    uint32_t tail_index;           /**< Oldest sample index */
    uint32_t dropped_samples;      /**< Overwritten samples counter */
    bool     is_psram_allocated;   /**< True if buffer resides in external PSRAM */
    size_t   allocated_bytes;      /**< Total heap/PSRAM memory consumed */
    uint64_t oldest_timestamp_us;  /**< Timestamp of oldest retained sample */
    uint64_t newest_timestamp_us;  /**< Timestamp of latest written sample */
} apex_buffer_status_t;

typedef struct {
    uint32_t requested_duration_sec;
    float    actual_duration_sec;
    uint32_t sample_count;
    uint32_t sequence_gaps_detected;
    uint64_t start_timestamp_us;
    uint64_t end_timestamp_us;
    apex_telemetry_sample_t *samples; /**< Dynamically allocated or snapshot buffer */
} apex_buffer_snapshot_t;

/**
 * @brief Initialize the 5-minute rolling buffer.
 * Attempts PSRAM allocation first; falls back gracefully to bounded internal SRAM with reduced capacity.
 */
int apex_rolling_buffer_init(uint32_t target_rate_hz);

/**
 * @brief Push a new sample into the rolling buffer. Thread-safe.
 */
int apex_rolling_buffer_push(const apex_telemetry_sample_t *sample);

/**
 * @brief Retrieve a snapshot of the last N seconds (up to 300s).
 * Does not disrupt ongoing live sample insertion.
 */
int apex_rolling_buffer_snapshot(uint32_t duration_sec, apex_buffer_snapshot_t *out_snapshot);

/**
 * @brief Free a retrieved snapshot.
 */
void apex_rolling_buffer_free_snapshot(apex_buffer_snapshot_t *snapshot);

/**
 * @brief Query current memory and buffer capacity metrics.
 */
void apex_rolling_buffer_get_status(apex_buffer_status_t *status);

#ifdef __cplusplus
}
#endif

#endif // APEX_ROLLING_BUFFER_H
