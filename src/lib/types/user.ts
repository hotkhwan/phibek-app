// src/lib/types/user.ts

export interface ApiResponse<T = unknown> {
  code: string
  message: string
  status: boolean
  details: T
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

export interface User {
  id: string
  email?: string
  firstName?: string
  lastName?: string
  fullName?: string
  enabled: boolean
  createdAt: string
}
