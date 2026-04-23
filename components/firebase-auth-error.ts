import { FirebaseError } from "firebase/app"

export function formatFirebaseAuthError(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return "Google sign-in failed with an unknown error."
  }

  const hintsByCode: Record<string, string> = {
    "auth/operation-not-allowed":
      "Enable Google under Firebase Console -> Authentication -> Sign-in method.",
    "auth/unauthorized-domain":
      "Add your app domain (for local dev usually localhost) to Authentication -> Settings -> Authorized domains.",
    "auth/popup-blocked":
      "Your browser blocked the popup. Try the redirect sign-in button below.",
    "auth/popup-closed-by-user":
      "The popup was closed before completing sign-in.",
    "auth/invalid-api-key": "Check NEXT_PUBLIC_FIREBASE_API_KEY in .env.local.",
    "auth/network-request-failed":
      "Network error. Check connectivity and any ad-block/privacy extensions.",
  }

  const hint =
    hintsByCode[error.code] ??
    "Check Firebase project config and browser console logs."

  return `Google sign-in failed (${error.code}). ${hint}`
}
