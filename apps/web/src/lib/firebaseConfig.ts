import { initializeApp, getApps } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";

const firebaseConfig = {
    apiKey:
        process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??
        "AIzaSyBMek_GPELnpRZ44As_DEZWHJQOnxgcGb0",
    authDomain:
        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??
        "audit-3a7ec.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "audit-3a7ec",
    storageBucket:
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
        "audit-3a7ec.firebasestorage.app",
    messagingSenderId:
        process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??
        "734175123527",
    appId:
        process.env.NEXT_PUBLIC_FIREBASE_APP_ID ??
        "1:734175123527:web:226b4fc4cfdefa686bf962",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth: Auth = getAuth(app);
