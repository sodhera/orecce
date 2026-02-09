// Firebase configuration for Orecce mobile app
// Using the same Firebase project as the web backend (audit-3a7ec)

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
    initializeAuth,
    // @ts-ignore
    getReactNativePersistence,
    getAuth,
    Auth,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase configuration
// These values match the web backend Firebase project
const firebaseConfig = {
    apiKey: 'AIzaSyBMek_GPELnpRZ44As_DEZWHJQOnxgcGb0',
    authDomain: 'audit-3a7ec.firebaseapp.com',
    projectId: 'audit-3a7ec',
    storageBucket: 'audit-3a7ec.firebasestorage.app',
    messagingSenderId: '734175123527',
    appId: '1:734175123527:web:226b4fc4cfdefa686bf962',
};

// Initialize Firebase
let app: FirebaseApp;
if (!getApps().length) {
    app = initializeApp(firebaseConfig);
} else {
    app = getApp();
}

// Initialize Auth with AsyncStorage persistence
let auth: Auth;
try {
    auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
    });
} catch (error) {
    // Auth already initialized
    auth = getAuth(app);
}

export { app, auth };
export default app;
