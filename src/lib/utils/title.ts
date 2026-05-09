// src/lib/utils/title.ts
import { browser } from '$app/environment'

export function setPageTitle(title: string): void {
  if (browser) {
    document.title = title
  }
}
