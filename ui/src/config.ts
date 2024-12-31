// Minimum length of a custom conversation title
export const MIN_TITLE_LENGTH = 3;

// Timestamp range of actions contained within a single bucket, in milliseconds
export const BUCKET_RANGE_MS = 1000 * 60 * 60 * 24; // 1 day

// Target number of messages to load in a single request for additional message history
export const TARGET_MESSAGES_COUNT = 20;

// Minimum length of profile first name
// This is not enforced by DNA validation, so is only softly required in the frontend.
export const MIN_FIRST_NAME_LENGTH = 3;

export const DEFAULT_CONVERSATION_CONFIG = { title: "", image: "" };
