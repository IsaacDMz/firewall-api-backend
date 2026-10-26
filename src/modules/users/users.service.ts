import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User, UserRole } from '../../database/entities/user.entity'
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface'
import { AuditService } from '../audit/audit.service'

type PendingProfessor = {
  username: string
  email: string
  passwordHash: string
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  async createPendingProfessor(data: PendingProfessor): Promise<User> {
    const user = this.usersRepository.create({
      ...data,
      role: UserRole.PROFESSOR,
      isActive: false,
    })

    return this.usersRepository.save(user)
  }

  findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ username })
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ email })
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ id })
  }

  findAll(): Promise<User[]> {
    return this.usersRepository.find({ order: { username: 'ASC' } })
  }

  async setActivation(id: string, isActive: boolean, actor: AuthenticatedUser, requestId: string): Promise<User> {
    if (!isActive && id === actor.id) {
      throw new ForbiddenException({ message: 'Users cannot deactivate their own account', code: 'SELF_DEACTIVATION_NOT_ALLOWED' })
    }

    const user = await this.findById(id)

    if (!user) {
      throw new NotFoundException({ message: 'User not found', code: 'USER_NOT_FOUND' })
    }

    if (user.isActive === isActive) {
      return user
    }

    user.isActive = isActive
    const updated = await this.usersRepository.save(user)
    await this.auditService.record({ actor, action: 'USER_ACTIVATION_CHANGED', resourceType: 'USER', resourceId: id, requestId, details: { username: user.username, previousIsActive: !isActive, isActive } })
    return updated
  }

  async promoteToAdmin(id: string, actor: AuthenticatedUser, requestId: string): Promise<User> {
    const user = await this.findById(id)

    if (!user) {
      throw new NotFoundException({ message: 'User not found', code: 'USER_NOT_FOUND' })
    }

    if (user.role === UserRole.ADMIN) {
      return user
    }

    user.role = UserRole.ADMIN
    const updated = await this.usersRepository.save(user)
    await this.auditService.record({ actor, action: 'USER_PROMOTED_TO_ADMIN', resourceType: 'USER', resourceId: id, requestId, details: { username: user.username, previousRole: UserRole.PROFESSOR, role: UserRole.ADMIN } })
    return updated
  }
}
