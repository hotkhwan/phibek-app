// src/lib/types/navigation.ts
import type { m } from '$lib/i18n/messages'

export type MenuTextKey = keyof typeof m

/**
 * Capabilities a sidebar entry can require IN ADDITION to its `menuId`
 * grant. Used when a page's BE gate is stricter than the menu-grant
 * registry (e.g. klynx-api 4.53.0 tightened the permission catalog
 * read-side to require `organization.manage` even when the caller has
 * the legacy `systemUsersPermissions` menu grant).
 */
export type SidebarRequireCapability = 'organization.manage'

export type SidebarChild = {
    id: string
    menuId?: string
    textKey: MenuTextKey
    url?: string
    children?: SidebarChild[]
    /**
     * Additional capability required to display this entry. AND'd with
     * the existing `menuId` visibility check. Mirrors klynx FE 3.50.0
     * sidebar gating where `systemUsersPermissions` requires
     * `organization.manage` per docs/contracts/permission-profile.md §5.2.
     */
    requireCapability?: SidebarRequireCapability
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
    /** Same capability gate as SidebarChild. */
    requireCapability?: SidebarRequireCapability
}

export type SidebarMenu =
    | SidebarMenuHeader
    | SidebarMenuDivider
    | SidebarMenuLink
