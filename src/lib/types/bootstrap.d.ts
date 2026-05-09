// src/lib/types/bootstrap.d.ts
declare module 'bootstrap' {
    export class Tooltip {
        constructor(element: Element, options?: Record<string, unknown>)
        dispose(): void
    }
}
