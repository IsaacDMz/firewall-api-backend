import { UserRole } from '../../database/entities/user.entity'

export type PublicUser = {
  id: string
  username: string
  email: string
  role: UserRole
  isActive: boolean
  createdAt: Date
}

export type TokenPair = {
  accessToken: string
  refreshToken: string
}
