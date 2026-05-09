// src/lib/types/settings.ts

export interface SystemSettings {
  appName: string
  appVersion: string
  systemName: string
  systemDescription: string
  systemLogoUrl: string
  auditRetentionDays: number
}

export interface BackupStatus {
  lastBackupAt: string | null  // RFC3339 UTC or null
}

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
}
