// src/lib/types/navigation/topNav.ts
import type { MenuText } from './common'

export type TopNavChild = {
    url?: string
    text: MenuText
    children?: TopNavChild[]
}

export type TopNavMenu = {
    url?: string
    icon?: string
    highlight?: boolean
    text: MenuText
    children?: TopNavChild[]
}
