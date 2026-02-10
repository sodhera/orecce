import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    TouchableOpacity,
    Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../styles/colors';

// Tab bar height from BottomTabNavigator (86px total)
const TAB_BAR_HEIGHT = 86;

interface ToastData {
    id: string;
    message: string;
    type: 'save' | 'unsave' | 'success' | 'error';
    actionLabel?: string;
    onAction?: () => void;
}

interface ToastContextType {
    showToast: (toast: Omit<ToastData, 'id'>) => void;
    hideToast: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

interface ToastProviderProps {
    children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
    const [toast, setToast] = useState<ToastData | null>(null);
    const slideAnim = useRef(new Animated.Value(100)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const hideToast = useCallback(() => {
        Animated.parallel([
            Animated.timing(slideAnim, {
                toValue: 100,
                duration: 250,
                useNativeDriver: true,
            }),
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start(() => {
            setToast(null);
        });
    }, [slideAnim, fadeAnim]);

    const showToast = useCallback((toastData: Omit<ToastData, 'id'>) => {
        // Clear any existing timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        const id = Date.now().toString();
        setToast({ ...toastData, id });

        // Animate in
        Animated.parallel([
            Animated.spring(slideAnim, {
                toValue: 0,
                useNativeDriver: true,
                tension: 80,
                friction: 12,
            }),
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start();

        // Auto dismiss after 3 seconds
        timeoutRef.current = setTimeout(() => {
            hideToast();
        }, 3000);
    }, [slideAnim, fadeAnim, hideToast]);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const getIconForType = (type: ToastData['type']) => {
        switch (type) {
            case 'save':
                return 'bookmark';
            case 'unsave':
                return 'bookmark-outline';
            case 'success':
                return 'checkmark-circle';
            case 'error':
                return 'alert-circle';
            default:
                return 'information-circle';
        }
    };

    const getIconColorForType = (type: ToastData['type']) => {
        switch (type) {
            case 'save':
            case 'unsave':
                return colors.primary;
            case 'success':
                return colors.success;
            case 'error':
                return colors.error;
            default:
                return colors.primary;
        }
    };

    return (
        <ToastContext.Provider value={{ showToast, hideToast }}>
            {children}
            {toast && (
                <Animated.View
                    style={[
                        styles.toastContainer,
                        {
                            transform: [{ translateY: slideAnim }],
                            opacity: fadeAnim,
                            bottom: TAB_BAR_HEIGHT + 8,
                        },
                    ]}
                >
                    <View style={styles.toastContent}>
                        <View style={styles.toastLeft}>
                            <Ionicons
                                name={getIconForType(toast.type)}
                                size={22}
                                color={getIconColorForType(toast.type)}
                            />
                            <Text style={styles.toastMessage} numberOfLines={1}>
                                {toast.message}
                            </Text>
                        </View>
                        {toast.actionLabel && toast.onAction && (
                            <TouchableOpacity
                                onPress={() => {
                                    toast.onAction?.();
                                    hideToast();
                                }}
                                style={styles.actionButton}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.actionButtonText}>
                                    {toast.actionLabel}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </Animated.View>
            )}
        </ToastContext.Provider>
    );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
    toastContainer: {
        position: 'absolute',
        left: 12,
        right: 12,
        zIndex: 9999,
        elevation: 10,
    },
    toastContent: {
        backgroundColor: colors.background, // White
        minHeight: 60, // Ensure exact match between Saved (with button) and Removed (text only)
        borderRadius: 12,
        paddingVertical: 12, // Reduced slightly to accommodate minHeight
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        shadowColor: colors.black,
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.15, // Softer shadow
        shadowRadius: 12,
        elevation: 8,
        borderWidth: 1,
        borderColor: colors.surface, // Subtle border
    },
    toastLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 12,
    },
    toastMessage: {
        color: colors.textPrimary, // Dark text
        fontSize: 14,
        fontWeight: '500',
        marginLeft: 12,
        flex: 1,
    },
    actionButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    actionButtonText: {
        color: colors.primary,
        fontSize: 14,
        fontWeight: '600',
    },
});
