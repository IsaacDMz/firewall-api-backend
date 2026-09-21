import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User, UserRole } from '../../database/entities/user.entity'

type PendingProfessor = {
  username: string
  email: string
  passwordHash: string
}

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly usersRepository: Repository<User>) {}

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

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ id })
  }
}
