import React from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../styles/colors';

interface SearchBarProps {
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
    onSearch?: () => void;
    style?: ViewStyle;
}

export function SearchBar({
    value,
    onChangeText,
    placeholder = 'Search...',
    onSearch,
    style
}: SearchBarProps) {
    return (
        <View style={[styles.container, style]}>
            <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.icon} />
            <TextInput
                style={styles.input}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={colors.textMuted}
                returnKeyType="search"
                onSubmitEditing={onSearch}
                autoCapitalize="none"
                autoCorrect={false}
            />
            {value.length > 0 && (
                <TouchableOpacity onPress={() => onChangeText('')} style={styles.clearButton}>
                    <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F0F0F0',
        borderRadius: 24,
        paddingHorizontal: 16,
        height: 48,
    },
    icon: {
        marginRight: 8,
    },
    input: {
        flex: 1,
        fontSize: 16,
        color: colors.textPrimary,
        height: '100%',
    },
    clearButton: {
        // padding removed
    },
});
