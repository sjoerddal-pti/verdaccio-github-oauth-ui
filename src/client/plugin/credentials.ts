//
// After a successful login we are redirected to the UI with our username
// and a JWT token. We need to save these in local storage so Verdaccio
// thinks we are logged in.
//

export interface Credentials {
  username: string
  uiToken: string
  npmToken: string
}

export function saveCredentials(credentials: Credentials) {
  localStorage.setItem("username", credentials.username)
  localStorage.setItem("token", credentials.uiToken)
  localStorage.setItem("npm", credentials.npmToken)
}

export function clearCredentials() {
  localStorage.removeItem("username")
  localStorage.removeItem("token")
  localStorage.removeItem("npm")
}

export function isLoggedIn() {
  const username = localStorage.getItem("username")
  const uiToken = localStorage.getItem("token")
  const npmToken = localStorage.getItem("npm")

  if (!username || !uiToken || !npmToken) {
    return false
  }

  // Attempt to parse the UI token and check its exp field
  try {
    const { exp } = JSON.parse(atob(uiToken.split('.')[1]))
    return exp > (Date.now() / 1000)
  } catch(err) {
    return false
  }
}

export function validateCredentials(credentials: Credentials) {
  return (
    true && credentials.username && credentials.uiToken && credentials.npmToken
  )
}
