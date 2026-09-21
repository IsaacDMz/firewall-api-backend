import { UserRole } from '../../database/entities/user.entity'

export interface AuthenticatedUser {
  id: string
  username: string
  role: UserRole
}
