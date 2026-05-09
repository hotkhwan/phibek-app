// src/lib/types/navigation/common.ts

export type MenuText = () => string

export function resolveMenuText(text: MenuText): string {
    return text()
}
