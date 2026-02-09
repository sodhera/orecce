import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../styles/colors';
import { ScreenHeader } from '../components';

export function CreateCollectionScreen() {
    const navigation = useNavigation();
    const [collectionName, setCollectionName] = useState('');

    const handleCancel = () => {
        navigation.goBack();
    };

    const handleContinue = () => {
        if (collectionName.trim()) {
            // TODO: Handle collection creation
            console.log('Creating collection:', collectionName);
            navigation.goBack();
        }
    };

    const isValid = collectionName.trim().length > 0;

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            {/* Header - matching Settings style */}
            <ScreenHeader
                title="Create a collection"
                onClose={handleCancel}
            />

            <View style={styles.content}>
                {/* Collection name input */}
                <View style={styles.inputSection}>
                    <Text style={styles.inputLabel}>Collection name</Text>
                    <TextInput
                        style={styles.input}
                        value={collectionName}
                        onChangeText={setCollectionName}
                        placeholder="Enter collection name"
                        placeholderTextColor={colors.textMuted}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={handleContinue}
                    />
                </View>

                {/* Continue button */}
                <TouchableOpacity
                    style={[styles.continueButton, !isValid && styles.continueButtonDisabled]}
                    onPress={handleContinue}
                    disabled={!isValid}
                >
                    <Text style={[styles.continueButtonText, !isValid && styles.continueButtonTextDisabled]}>
                        Continue
                    </Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        flex: 1,
        paddingHorizontal: 16,
        justifyContent: 'center',
    },
    inputSection: {
        marginBottom: 32,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textSecondary,
        marginBottom: 8,
    },
    input: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: colors.textPrimary,
    },
    continueButton: {
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 50,
        backgroundColor: colors.primary,
        alignItems: 'center',
        alignSelf: 'center',
    },
    continueButtonDisabled: {
        backgroundColor: colors.surface,
    },
    continueButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.white,
    },
    continueButtonTextDisabled: {
        color: colors.textMuted,
    },
});
