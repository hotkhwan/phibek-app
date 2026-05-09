// src/jsvectormap.d.ts
declare module 'jsvectormap' {
    type VectorMapInstance = unknown

    type VectorMapOptions = {
        selector: string
        map: string
        zoomButtons?: boolean
        normalizeFunction?: string
        hoverOpacity?: number
        hoverColor?: boolean | string
        zoomOnScroll?: boolean
        series?: unknown
        labels?: unknown
        focusOn?: unknown
        markers?: Array<{ name: string; coords: [number, number] }>
        markerStyle?: unknown
        markerLabelStyle?: unknown
        regionStyle?: unknown
        backgroundColor?: string
    }

    export default class jsVectorMap {
        constructor(options: VectorMapOptions)
        updateSize?(): void
        destroy?(): void
    }

    export type { VectorMapOptions, VectorMapInstance }
}

declare module 'jsvectormap/dist/maps/world.js' {
    const worldMap: unknown
    export default worldMap
}
