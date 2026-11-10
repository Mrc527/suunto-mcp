/** English texts: auth (sign in, sign up / request access, invites, sign out). Keys start with "auth.". */
export default {
  // Form fields used on several pages
  "auth.field.email": "Email",
  "auth.field.password": "Password",

  // Sign in
  "auth.signIn.title": "Sign in",
  "auth.signIn.intro": "Use the account you created on this server. This is not your PADI account.",
  "auth.signIn.button": "Sign in",
  "auth.signIn.noAccountRequest": "No account yet? <a href=\"{url}\">Request access</a>.",
  "auth.signIn.noAccountCreate": "No account yet? <a href=\"{url}\">Create one</a>.",
  "auth.signIn.wrongCredentials": "Wrong email or password. If you requested access, it may still be waiting for approval.",
  "auth.signIn.disabled": "This account is disabled.",

  // Sign up: closed
  "auth.signUp.closedTitle": "Sign up",
  "auth.signUp.closedHeading": "Sign up is closed",
  "auth.signUp.closedText": "Ask the administrator of this server for an account.",

  // Sign up: form
  "auth.signUp.requestTitle": "Request access",
  "auth.signUp.createTitle": "Create an account",
  "auth.signUp.introFirst": "You are the first user, so this account will be the administrator.",
  "auth.signUp.introApproval": "An administrator reviews each request. You can sign in once your request is approved.",
  "auth.signUp.introOpen": "Create an account on this server. You will sign in to PADI next.",
  "auth.signUp.emailHint": "Used to sign in to this server.",
  "auth.signUp.emailHintDomains": "Used to sign in to this server. Allowed domains: {domains}.",
  "auth.signUp.passwordHint.one": "At least {n} character. Do not use your PADI password here.",
  "auth.signUp.passwordHint.other": "At least {n} characters. Do not use your PADI password here.",
  "auth.signUp.repeatPassword": "Repeat password",
  "auth.signUp.inviteCode": "Invite code",
  "auth.signUp.inviteHint": "Optional. With a valid code your account works right away.",
  "auth.signUp.note": "Message to the administrator",
  "auth.signUp.noteHint": "Optional. Who you are and why you need access.",
  "auth.signUp.consent": "I understand that this server will keep a PADI sign-in token (encrypted, never my PADI password) to act on my behalf.",
  // Shown right after auth.signUp.consent, next to the same checkbox. The links open in a new tab.
  "auth.signUp.consentTerms": "I agree to the <a href=\"/terms\" target=\"_blank\" rel=\"noopener\">terms of use</a> and have read the <a href=\"/privacy\" target=\"_blank\" rel=\"noopener\">privacy policy</a>.",
  "auth.signUp.sendRequest": "Send request",
  "auth.signUp.createAccount": "Create account",
  "auth.signUp.alreadyRegistered": "Already registered? <a href=\"/login\">Sign in</a>.",

  // Request sent
  "auth.requestSent.title": "Request sent",
  "auth.requestSent.thanks": "Thank you. An administrator will review your request.",
  "auth.requestSent.noEmail": "You will not get an email, so check back later or ask the administrator.",
  "auth.requestSent.signInLater": "Once it is approved, sign in with your email and password. If you had already sent a request for this address, only the first one counts: use the password you chose then.",
  "auth.requestSent.expiry": "Requests that are not answered within 30 days are deleted. You can then send a new one.",
  "auth.requestSent.goToSignIn": "Go to sign in",

  // Password rules (also used when changing the password)
  "auth.password.tooShort.one": "Use at least {n} character.",
  "auth.password.tooShort.other": "Use at least {n} characters.",
  "auth.password.tooLong": "That password is too long.",

  // Form errors
  "auth.error.formExpired": "Your form expired. Please try again.",
  "auth.error.invalidEmail": "Enter a valid email address.",
  "auth.error.domainNotAllowed": "Only addresses at {domains} can sign up.",
  "auth.error.passwordsDiffer": "The passwords do not match.",
  "auth.error.consent": "Please confirm the checkbox.",
  "auth.error.inviteInvalid": "This invite code is not valid or was already used.",
  "auth.error.tooManyOpenRequests": "There are too many open requests right now. Please try again later.",
  "auth.error.accountExists": "An account with this email already exists.",

  // Rate limits
  "auth.error.tooManyAttempts": "Too many attempts. Try again in a few minutes.",
  "auth.error.tooManyRequestsToday": "You sent several requests today. Please wait for an answer from the administrator.",
};
