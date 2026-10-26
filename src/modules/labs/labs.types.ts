import { LabStatus } from '../../database/entities/lab.entity'

export type LabResponse = {
  id: number
  name: string
  block: {
    id: string
    name: string
  }
  subnet: string
  status: LabStatus
}
