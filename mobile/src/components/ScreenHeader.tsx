import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../styles/colors';
import { useNavigation } from '@react-navigation/native';

interface ScreenHeaderProps {
    title: string;
    onClose?: () => void;
    onBack?: () => void;
    style?: ViewStyle;
    rightAction?: React.ReactNode;
}

export function ScreenHeader({ title, onClose, onBack, style, rightAction }: ScreenHeaderProps) {
    const navigation = useNavigation();

    const handleBack = onBack || (navigation.canGoBack() ? () => navigation.goBack() : undefined);
    const handleClose = onClose || (() => navigation.goBack());

    // Scenario 1: Modal style (Right Close Button)
    if (onClose || (!onBack && !handleBack && onClose !== null)) {
        return (
            <View style={[styles.header, style]}>
                <View style={styles.headerSpacer} />
                <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
                <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                    <Ionicons name="close" size={18} color={colors.textPrimary} />
                </TouchableOpacity>
            </View>
        );
    }

    // Scenario 2: Stack style (Left Back Button)
    return (
        <View style={[styles.header, style]}>
            <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
            <View style={styles.headerSpacer} />
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12, // Standardized padding
        justifyContent: 'space-between',
        // Border bottom can be added via style prop if needed, or default here
        // borderBottomWidth: 1, 
        // borderBottomColor: colors.surface,
    },
    headerTitle: {
        flex: 1, // Ensure title takes available space for centering
        fontSize: 17, // Standardized font size
        fontWeight: '600',
        color: colors.textPrimary,
        textAlign: 'center',
    },
    headerSpacer: {
        width: 32, // Match close/back button width for perfect centering
    },
    closeButton: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: 'rgba(0,0,0,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    backButton: {
        width: 32, // Fixed width for alignment
        alignItems: 'flex-start',
        justifyContent: 'center',
    },
});
