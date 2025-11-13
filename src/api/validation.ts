import { z } from 'zod';
import type { AnalyticsEvent, ValidationResult } from '../types/events.js';
import { apiLogger as logger } from '../utils/logger.js';

// Define allowed tool names (all 12 tools from weather-mcp v1.6.1)
const VALID_TOOLS = [
  'get_forecast',
  'get_current_conditions',
  'get_alerts',
  'get_historical_weather',
  'check_service_status',
  'search_location',
  'get_air_quality',
  'get_marine_conditions',
  'get_weather_imagery',
  'get_lightning_activity',
  'get_river_conditions',
  'get_wildfire_info',
] as const;

// Define allowed service types
const VALID_SERVICES = ['noaa', 'openmeteo'] as const;

// Zod schema for minimal event
const MinimalEventSchema = z.object({
  version: z.string().min(1).max(20),
  tool: z.enum(VALID_TOOLS),
  status: z.enum(['success', 'error']),
  timestamp_hour: z.string().datetime(),
  analytics_level: z.literal('minimal'),
});

// Zod schema for standard event
const StandardEventSchema = MinimalEventSchema.extend({
  analytics_level: z.literal('standard'),
  response_time_ms: z.number().int().min(0).max(120000).optional(),
  service: z.enum(VALID_SERVICES).optional(),
  cache_hit: z.boolean().optional(),
  retry_count: z.number().int().min(0).max(10).optional(),
  country: z.string().length(2).optional(), // ISO 3166-1 alpha-2
  error_type: z.string().max(100).optional(),
});

// Zod schema for detailed event
const DetailedEventSchema = StandardEventSchema.extend({
  analytics_level: z.literal('detailed'),
  parameters: z.record(z.unknown()).optional(),
  session_id: z.string().length(16).optional(), // Hashed session ID
  sequence_number: z.number().int().min(0).optional(),
});

// Union schema for any event type
const EventSchema = z.discriminatedUnion('analytics_level', [
  MinimalEventSchema,
  StandardEventSchema,
  DetailedEventSchema,
]);

// Batch request schema
const EventBatchSchema = z.object({
  events: z.array(EventSchema).min(1).max(100),
});

// List of field names that contain PII and should be rejected
const PII_FIELDS = [
  'latitude',
  'longitude',
  'lat',
  'lon',
  'location',
  'address',
  'city',
  'street',
  'zip',
  'zipcode',
  'postal_code',
  'user_id',
  'userId',
  'user',
  'username',
  'email',
  'phone',
  'ip',
  'ip_address',
  'ipAddress',
  'name',
  'first_name',
  'last_name',
  'firstName',
  'lastName',
  'ssn',
  'social_security',
];

/**
 * Check if an event contains PII (Personally Identifiable Information)
 * Returns true if PII is detected, false otherwise
 */
function hasPII(event: unknown): boolean {
  if (typeof event !== 'object' || event === null) {
    return false;
  }

  const eventObj = event as Record<string, unknown>;

  // Check top-level fields
  for (const field of PII_FIELDS) {
    if (field in eventObj) {
      logger.warn({ field }, 'PII field detected in event');
      return true;
    }
  }

  // Check parameters field if it exists
  if ('parameters' in eventObj && typeof eventObj.parameters === 'object' && eventObj.parameters !== null) {
    const params = eventObj.parameters as Record<string, unknown>;
    for (const field of PII_FIELDS) {
      if (field in params) {
        logger.warn({ field: `parameters.${field}` }, 'PII field detected in parameters');
        return true;
      }
    }
  }

  return false;
}

/**
 * Validate a batch of events
 * Returns validated events or errors
 */
export function validateEventBatch(body: unknown): ValidationResult<AnalyticsEvent[]> {
  // First, check if body has the basic structure
  if (typeof body !== 'object' || body === null || !('events' in body)) {
    return {
      valid: false,
      errors: ['Request body must have an "events" array field'],
    };
  }

  const bodyObj = body as { events: unknown };

  if (!Array.isArray(bodyObj.events)) {
    return {
      valid: false,
      errors: ['events field must be an array'],
    };
  }

  const rawEvents = bodyObj.events;

  // Check PII BEFORE schema validation (Zod strips unknown fields)
  for (let i = 0; i < rawEvents.length; i++) {
    if (hasPII(rawEvents[i])) {
      return {
        valid: false,
        errors: [`Event ${i}: Contains PII (rejected for privacy)`],
      };
    }
  }

  // Now validate with Zod schema
  const batchResult = EventBatchSchema.safeParse(body);

  if (!batchResult.success) {
    const errors = batchResult.error.errors.map((err) => {
      return `${err.path.join('.')}: ${err.message}`;
    });

    logger.warn({ errors }, 'Batch validation failed');
    return {
      valid: false,
      errors,
    };
  }

  const { events } = batchResult.data;
  const validatedEvents: AnalyticsEvent[] = [];
  const errors: string[] = [];

  // Validate each event individually
  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    // Additional validation rules
    // Rule: error events must have error_type
    if (event.status === 'error' && event.analytics_level !== 'minimal') {
      const hasErrorType = 'error_type' in event && event.error_type;
      if (!hasErrorType) {
        errors.push(`Event ${i}: Error events at standard/detailed level must include error_type`);
        continue;
      }
    }

    // Rule: timestamp_hour must be rounded to the hour
    try {
      const timestamp = new Date(event.timestamp_hour);
      if (timestamp.getMinutes() !== 0 || timestamp.getSeconds() !== 0 || timestamp.getMilliseconds() !== 0) {
        errors.push(`Event ${i}: timestamp_hour must be rounded to the hour (e.g., 2025-11-11T14:00:00Z)`);
        continue;
      }
    } catch (err) {
      errors.push(`Event ${i}: Invalid timestamp_hour format`);
      continue;
    }

    validatedEvents.push(event);
  }

  // If we have errors, return them
  if (errors.length > 0) {
    logger.warn({ errorCount: errors.length, validCount: validatedEvents.length }, 'Some events failed validation');
    return {
      valid: false,
      errors,
    };
  }

  logger.debug({ count: validatedEvents.length }, 'All events validated successfully');
  return {
    valid: true,
    data: validatedEvents,
  };
}

/**
 * Validate a single event (used for testing)
 */
export function validateEvent(event: unknown): ValidationResult<AnalyticsEvent> {
  if (hasPII(event)) {
    return {
      valid: false,
      errors: ['Event contains PII'],
    };
  }

  const result = EventSchema.safeParse(event);

  if (!result.success) {
    const errors = result.error.errors.map((err) => {
      return `${err.path.join('.')}: ${err.message}`;
    });

    return {
      valid: false,
      errors,
    };
  }

  return {
    valid: true,
    data: result.data,
  };
}

/**
 * Get list of valid tool names
 */
export function getValidTools(): readonly string[] {
  return VALID_TOOLS;
}

/**
 * Get list of valid service names
 */
export function getValidServices(): readonly string[] {
  return VALID_SERVICES;
}
