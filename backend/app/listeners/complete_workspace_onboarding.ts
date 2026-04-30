import db from '@adonisjs/lucid/services/db'
import InvocationCompleted from '#events/invocation_completed'
import Invocation from '#models/invocation'
import Workspace from '#models/workspace'

export default class CompleteWorkspaceOnboarding {
  async handle(event: InvocationCompleted) {
    const { payload } = event

    if (payload.blocked) {
      return
    }

    await db.transaction(async (trx) => {
      const invocation = await Invocation.query({ client: trx })
        .where('id', payload.invocationId)
        .where('source', 'onboarding')
        .whereNull('parent_invocation_id')
        .first()

      if (!invocation) {
        return
      }

      const workspace = await Workspace.query({ client: trx }).where('id', invocation.workspaceId).forUpdate().first()

      if (!workspace || workspace.onboardingStatus === 'completed' || workspace.onboardingStatus === 'dismissed') {
        return
      }

      workspace.onboardingStatus = 'completed'
      workspace.useTransaction(trx)
      await workspace.save()
    })
  }
}
