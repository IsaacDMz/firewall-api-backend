import { LabStatus } from '../../database/entities/lab.entity'

export type LabResponse = {
  id: number
  name: string
  block: string
  subnet: string
  status: LabStatus
}
