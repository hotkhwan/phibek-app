// src/lib/types/navigation.ts
import type { m } from '$lib/i18n/messages'

export type MenuTextKey = keyof typeof m

export type SidebarChild = {
    id: string
    menuId?: string
    textKey: MenuTextKey
    url?: string
    children?: SidebarChild[]
}

export type SidebarMenuHeader = {
    kind: 'header'
    id: string
    textKey: MenuTextKey
}

export type SidebarMenuDivider = {
    kind: 'divider'
    id: string
}

export type SidebarMenuLink = {
    kind: 'link'
    id: string
    menuId?: string
    textKey: MenuTextKey
    icon?: string
    url?: string
    highlight?: boolean
    children?: SidebarChild[]
}

export type SidebarMenu =
    | SidebarMenuHeader
    | SidebarMenuDivider
    | SidebarMenuLink
