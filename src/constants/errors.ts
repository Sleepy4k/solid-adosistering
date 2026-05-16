export const ERROR_MESSAGES = {
  unauthenticated: "Session is not valid. Please login again.",
  forbidden: "You do not have permission to access this resource.",
  failedToFetch: "Data could not be loaded. Please check the connection and try again.",
  invalidRegion: "Region is outside the current user access scope.",
} as const;
