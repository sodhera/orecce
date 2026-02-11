import { initializeApp, getApps } from "firebase/app";
import { getAuth, connectAuthEmulator, Auth } from "firebase/auth";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "fake-api-key",
    authDomain:
        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "audit-3a7ec.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "audit-3a7ec",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth: Auth = getAuth(app);

// Auto-connect to the local Auth emulator in development
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    try {
        connectAuthEmulator(auth, "http://127.0.0.1:9099", {
            disableWarnings: true,
        });
    } catch {
        // Already connected — ignore
    }
}
