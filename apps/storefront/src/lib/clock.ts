// The current time in milliseconds. Server pages render once per request, so reading the
// clock while rendering is intended there; client components use useNow() instead.
export const nowMs = () => Date.now()
