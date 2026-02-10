import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../styles/colors';

export function InboxScreen() {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Inbox</Text>
            <Text style={styles.subtitle}>Your messages will appear here</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: colors.textSecondary,
    },
});
