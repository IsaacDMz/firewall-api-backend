import { Module } from '@nestjs/common'
import { SshController } from 'src/controllers/SshController'
import { SshService } from 'src/services/SshService'

@Module({
  imports: [],
  controllers: [SshController],
  providers: [SshService],
})
export class AppModule {}
