// src/lib/types/dashboard/dash.ts
import type { ApexOptions } from 'apexcharts'

export type Unsubscribe = () => void

export type AppVariables = {
  color: {
    theme: string
    themeRgb: string
    inverse: string
    inverseRgb: string
    blackRgb: string
    bodyColor: string
    bodyColorRgb: string
  }
  font: {
    bodyFontFamily?: string
    bodyFontfamily?: string
  }
}

export type StatInfoItem = {
  icon: string
  text: string
}

export type StatItem = {
  title: string
  total: string
  info?: StatInfoItem[]
  chartClass?: string
  chartOptions?: ApexOptions
  chartHeight?: string | number
}

export type ServerStatInfoItem = {
  title: string
  value: string
  class: string
}

export type ServerStatItem = {
  name: string
  total: string
  progress: string
  time: string
  info?: ServerStatInfoItem[]
  chartOptions?: ApexOptions
  chartHeight?: string | number
}

export type ServerData = {
  chartOptions: ApexOptions
  chartHeight?: string | number
  stats: ServerStatItem[]
}

export type TrafficCountryItem = {
  name: string
  visits: string
  pct: string
  class: string
}

export type TrafficSourceItem = {
  name: string
  percentage: string
  class: string
}

export type TrafficData = {
  country: TrafficCountryItem[]
  source: TrafficSourceItem[]
  chart: {
    options: ApexOptions
    height?: string | number
  }
}

export type ProductItem = {
  img: string
  no: string
  sku: string
  title: string
  price: string
  qty: string
  revenue: string
  profit: string
}

export type LogItem = {
  title: string
  time: string
  badge: string
  highlight: boolean
}

export type VectorMarker = { name: string }
