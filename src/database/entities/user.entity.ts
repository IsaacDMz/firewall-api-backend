import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm'

export enum UserRole {
  PROFESSOR = 'PROFESSOR',
  ADMIN = 'ADMIN',
}

@Entity({ name: 'users' })
@Unique('UQ_users_username', ['username'])
@Unique('UQ_users_email', ['email'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 64 })
  username!: string

  @Column({ type: 'varchar', length: 255 })
  email!: string

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string

  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role', default: UserRole.PROFESSOR })
  role!: UserRole

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive!: boolean

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
