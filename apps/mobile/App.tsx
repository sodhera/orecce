import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Animated, View, Dimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { SignupNavigator } from './src/navigation/SignupNavigator';
import { LoginNavigator } from './src/navigation/LoginNavigator';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuth } from './src/hooks/useAuth';
import { colors } from './src/styles/colors';
import { InterestsProvider } from './src/context/InterestsContext';
import { ToastProvider } from './src/context/ToastContext';
import { SplashScreen } from './src/components/SplashScreen';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ScreenState = 'welcome' | 'signup' | 'login' | 'verify-email';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenState>('welcome');
  const [showSplash, setShowSplash] = useState(true);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [verificationGateDismissed, setVerificationGateDismissed] = useState(false);
  const { user, isLoading } = useAuth();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const splashFadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Handle transition from splash to main content
  useEffect(() => {
    if (!isLoading) {
      // Fade out splash, fade in content
      Animated.parallel([
        Animated.timing(splashFadeAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowSplash(false);
      });
    }
  }, [isLoading, fadeAnim, splashFadeAnim]);

  const handleCreateAccount = () => {
    setCurrentScreen('signup');
    // Slide in from right
    slideAnim.setValue(SCREEN_WIDTH);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const handleSignIn = () => {
    setCurrentScreen('login');
    // Slide in from right
    slideAnim.setValue(SCREEN_WIDTH);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const handleBackToWelcome = () => {
    // Slide out to right
    Animated.timing(slideAnim, {
      toValue: SCREEN_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setCurrentScreen('welcome');
      // Don't reset slideAnim here - it causes a flicker
      // It will be reset when user navigates to signup/login again
    });
  };

  // If user is unverified and we don't already have a pending email, gate with verify screen (unless dismissed)
  useEffect(() => {
    if (user && !user.emailVerified && !pendingVerificationEmail && !verificationGateDismissed) {
      setPendingVerificationEmail(user.email || '');
      setCurrentScreen('verify-email');
    }
  }, [user, pendingVerificationEmail, verificationGateDismissed]);

  // Reset gate state on sign-out
  useEffect(() => {
    if (!user) {
      setPendingVerificationEmail(null);
      setVerificationGateDismissed(false);
    }
  }, [user]);

  // Determine which content to show
  const renderContent = () => {
    // If user just signed up or is unverified (and gate not dismissed), show verify screen
    if (user && !verificationGateDismissed && (pendingVerificationEmail || !user.emailVerified)) {
      const { SignupVerifyEmailScreen } = require('./src/screens/signup/SignupVerifyEmailScreen');
      return (
        <View style={styles.screenContainer}>
          <SignupVerifyEmailScreen
            email={pendingVerificationEmail || user.email || ''}
            onLater={() => {
              setPendingVerificationEmail(null);
              setVerificationGateDismissed(true);
            }}
          />
        </View>
      );
    }

    // If user is logged in, show main app
    if (user) {
      return (
        <InterestsProvider>
          <ToastProvider>
            <NavigationContainer>
              <RootNavigator />
            </NavigationContainer>
          </ToastProvider>
        </InterestsProvider>
      );
    }

    // Show welcome screen with overlay screens
    return (
      <View style={styles.screenContainer}>
        {/* Welcome screen is always rendered in the background */}
        <WelcomeScreen
          onCreateAccount={handleCreateAccount}
          onSignIn={handleSignIn}
        />

        {/* Signup/Login screens slide over */}
        {currentScreen !== 'welcome' && (
          <Animated.View
            style={[
              styles.overlayScreen,
              { transform: [{ translateX: slideAnim }] },
            ]}
          >
            {currentScreen === 'signup' ? (
              <NavigationContainer>
                <SignupNavigator
                  onCancel={handleBackToWelcome}
                  onSignupComplete={(email) => setPendingVerificationEmail(email)}
                />
              </NavigationContainer>
            ) : (
              <NavigationContainer>
                <LoginNavigator onCancel={handleBackToWelcome} />
              </NavigationContainer>
            )}
          </Animated.View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={styles.container}>
        {/* Main content with fade-in */}
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          {renderContent()}
        </Animated.View>

        {/* Splash overlay with fade-out */}
        {showSplash && (
          <Animated.View
            style={[styles.splashOverlay, { opacity: splashFadeAnim }]}
            pointerEvents="none"
          >
            <SplashScreen />
          </Animated.View>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  screenContainer: {
    flex: 1,
  },
  overlayScreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
  },
});
