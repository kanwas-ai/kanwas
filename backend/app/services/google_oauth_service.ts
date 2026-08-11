import { google } from 'googleapis'
import env from '#start/env'

export class GoogleOAuthService {
  private oauth2Client

  constructor() {
    const clientId = env.get('GOOGLE_CLIENT_ID')
    const clientSecret = env.get('GOOGLE_CLIENT_SECRET')
    const redirectUri = env.get('GOOGLE_REDIRECT_URI')

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Google OAuth credentials are not configured')
    }

    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)

    // Configure gaxios to use Node.js native fetch (available in Node.js 18+)
    // This prevents the "fetchImpl is not a function" error in gaxios 7.1.2
    this.oauth2Client.transporter.defaults.fetchImplementation = fetch
  }

  getAuthUrl(options: { state?: string } = {}) {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
      prompt: 'consent',
      state: options.state,
    })
  }

  async getTokens(code: string) {
    const { tokens } = await this.oauth2Client.getToken(code)
    return tokens
  }

  async getUserInfo(accessToken: string) {
    this.oauth2Client.setCredentials({ access_token: accessToken })
    const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client })
    const { data } = await oauth2.userinfo.get()
    return data
  }
}
