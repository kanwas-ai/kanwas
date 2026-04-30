export function describeConnectionLoss(reason: string | null): string | null {
  switch (reason) {
    case 'ping timeout':
      return 'The live sync connection timed out.'
    case 'transport close':
    case 'transport error':
      return 'The network connection to live sync was lost.'
    case 'io server disconnect':
      return 'The server closed the live sync session.'
    case 'io client disconnect':
      return 'Live sync was closed locally.'
    default:
      return reason ? `Last disconnect reason: ${reason}.` : null
  }
}
