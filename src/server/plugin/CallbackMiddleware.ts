import { Handler, NextFunction, Request, Response } from "express"
import * as querystring from "querystring"

import { GithubClient } from "../github"
import { Auth, Config, User } from "../verdaccio"

export class CallbackMiddleware {

  public static readonly path = "/-/oauth/callback"

  private readonly github = new GithubClient(this.config.user_agent)

  constructor(
    private readonly config: Config,
    private readonly auth: Auth,
  ) { }

  /**
   * After a successful OAuth authentication, GitHub redirects back to us.
   * We use the OAuth code to get an OAuth access token and the username associated
   * with the GitHub account.
   *
   * The token and username are encryped and base64 encoded and configured as npm
   * credentials for this registry. There is no need to later decode and decrypt the token.
   * This process is automatically reversed before the token is passed to the authenticate
   * middleware.
   *
   * We then issue a JWT token using these values and pass them back to the frontend
   * as query parameters so they can be stored in the browser.
   */
  public middleware: Handler = async (req: Request, res: Response, next: NextFunction) => {
    const code = req.query.code
    const clientId = process.env[this.config["client-id"]] || this.config["client-id"]
    const clientSecret = process.env[this.config["client-secret"]] || this.config["client-secret"]

    try {
      const githubOauth = await this.github.requestAccessToken(code, clientId, clientSecret)
      const githubUser = await this.github.requestUser(githubOauth.access_token)

      const npmAuth = githubUser.login + ":" + githubOauth.access_token
      const npmAuthEncrypted = this.auth.aesEncrypt(new Buffer(npmAuth)).toString("base64")

      const frontendUser = { name: githubUser.login }
      const frontendToken = this.auth.issueUIjwt(frontendUser)
      const frontendUrl = "/?" + querystring.stringify({
        jwtToken: frontendToken,
        npmToken: npmAuthEncrypted,
        username: githubUser.login,
      })

      res.redirect(frontendUrl)
    } catch (error) {
      next(error)
    }
  }

}
