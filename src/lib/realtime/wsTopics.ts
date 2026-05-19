// src/lib/realtime/wsTopics.ts
// Canonical klynx-api realtime WSS topic names.
// Source: klynx-api/docs/contracts/realtime-wss.md §6.11.

export const WS_TOPICS = {
  CAMERA_STATUS: 'camera.status',
  KCONTROL_STATUS: 'kcontrol.status',
  KCONTROL_ALARM: 'kcontrol.alarm',
  KCONTROL_EVENT: 'kcontrol.event',
  KCONTROL_TEMPERATURE: 'kcontrol.temperature',
  INGEST_EVENT: 'ingest.event',
  INGEST_BLACKLIST: 'ingest.blacklist'
} as const

export type WsTopic = (typeof WS_TOPICS)[keyof typeof WS_TOPICS]

export const ALL_WS_TOPICS: readonly WsTopic[] = Object.freeze([
  WS_TOPICS.CAMERA_STATUS,
  WS_TOPICS.KCONTROL_STATUS,
  WS_TOPICS.KCONTROL_ALARM,
  WS_TOPICS.KCONTROL_EVENT,
  WS_TOPICS.KCONTROL_TEMPERATURE,
  WS_TOPICS.INGEST_EVENT,
  WS_TOPICS.INGEST_BLACKLIST
])

export function isWsTopic(value: string): value is WsTopic {
  return (ALL_WS_TOPICS as readonly string[]).includes(value)
}
