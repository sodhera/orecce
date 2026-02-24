export interface AuthIdentity {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface AuthVerifier {
  verifyBearerToken(token: string): Promise<AuthIdentity>;
}
