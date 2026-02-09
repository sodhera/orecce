import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/colors';

export interface CategoryCapsuleProps {
    label: string;
    isActive: boolean;
    onPress: () => void;
}

export function CategoryCapsule({ label, isActive, onPress }: CategoryCapsuleProps) {
    return (
        <TouchableOpacity
            style={[
                styles.container,
                isActive && styles.activeContainer,
            ]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <Text style={[styles.text, isActive && styles.activeText]}>
                {label}
            </Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: colors.surface,
        marginRight: 8,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    activeContainer: {
        backgroundColor: colors.black,
        borderColor: colors.black,
    },
    text: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    activeText: {
        color: colors.white,
    },
});
