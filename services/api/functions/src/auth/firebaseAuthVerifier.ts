import { Auth, getAuth } from "firebase-admin/auth";

export interface AuthIdentity {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface AuthVerifier {
  verifyBearerToken(token: string): Promise<AuthIdentity>;
}

export class FirebaseAuthVerifier implements AuthVerifier {
  constructor(
    private readonly auth: Auth = getAuth(),
    private readonly checkRevoked: boolean = process.env.FIREBASE_CHECK_REVOKED === "true"
  ) {}

  async verifyBearerToken(token: string): Promise<AuthIdentity> {
    const decoded = await this.auth.verifyIdToken(token, this.checkRevoked);
    return {
      uid: decoded.uid,
      email: typeof decoded.email === "string" ? decoded.email : null,
      displayName: typeof decoded.name === "string" ? decoded.name : null,
      photoURL: typeof decoded.picture === "string" ? decoded.picture : null
    };
  }
}
