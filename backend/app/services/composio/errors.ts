export class ToolkitRequiredError extends Error {
  constructor(message: string = 'Toolkit is required') {
    super(message)
    this.name = 'ToolkitRequiredError'
  }
}

export class ToolkitRequiresCustomAuthConfigError extends Error {
  constructor(toolkit: string) {
    super(`Toolkit "${toolkit}" requires a custom auth config`)
    this.name = 'ToolkitRequiresCustomAuthConfigError'
  }
}

export class InvalidConnectionCallbackUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidConnectionCallbackUrlError'
  }
}

export class InvalidCustomAuthConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidCustomAuthConfigError'
  }
}

export class ConnectionNotInWorkspaceError extends Error {
  constructor() {
    super('Connection not found for this workspace')
    this.name = 'ConnectionNotInWorkspaceError'
  }
}

export class SlackNotConnectedError extends Error {
  constructor() {
    super('Slack is not connected for this workspace')
    this.name = 'SlackNotConnectedError'
  }
}

export class SlackInvalidPermalinkError extends Error {
  constructor() {
    super('Invalid Slack permalink format')
    this.name = 'SlackInvalidPermalinkError'
  }
}

export class SlackMessageNotFoundError extends Error {
  constructor() {
    super('Slack message not found')
    this.name = 'SlackMessageNotFoundError'
  }
}
