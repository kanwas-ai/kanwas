import scheduler from 'adonisjs-scheduler/services/main'

scheduler.command('agent-runtime:recover').everyFiveSeconds().immediate().withoutOverlapping(30_000)
