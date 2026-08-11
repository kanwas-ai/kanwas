import type { ApplicationService } from '@adonisjs/core/types'
import { Worker } from 'adonisjs-scheduler'

export default class SchedulerWorkerProvider {
  private worker: Worker | null = null

  constructor(protected app: ApplicationService) {}

  async ready() {
    this.worker = new Worker(this.app)
    await this.worker.start()
  }

  async shutdown() {
    if (this.worker) {
      await this.worker.stop()
      this.worker = null
    }
  }
}
