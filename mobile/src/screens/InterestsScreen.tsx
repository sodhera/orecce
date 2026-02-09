import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../styles/colors';
import { useInterests } from '../context/InterestsContext';

export function InterestsScreen() {
    const navigation = useNavigation();
    const { interests, addInterest, removeInterest } = useInterests();
    const [newInterest, setNewInterest] = useState('');

    const handleAdd = async () => {
        if (!newInterest.trim()) return;
        await addInterest(newInterest);
        setNewInterest('');
    };

    const handleDelete = (interest: string) => {
        if (interest === 'All') {
            Alert.alert('Cannot delete "All"');
            return;
        }
        Alert.alert(
            'Remove Interest',
            `Are you sure you want to remove "${interest}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => removeInterest(interest) }
            ]
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerSpacer} />
                <Text style={styles.headerTitle}>Interests</Text>
                <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
                    <Ionicons name="close" size={18} color={colors.textPrimary} />
                </TouchableOpacity>
            </View>

            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.input}
                    placeholder="Add new interest..."
                    value={newInterest}
                    onChangeText={setNewInterest}
                    onSubmitEditing={handleAdd}
                    placeholderTextColor={colors.textSecondary}
                />
                <TouchableOpacity onPress={handleAdd} style={styles.addButton} disabled={!newInterest.trim()}>
                    <Ionicons name="add" size={24} color="#333333" />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.listContent}>
                <View style={styles.wrapContainer}>
                    {interests.map((item) => (
                        <View key={item} style={styles.capsuleContainer}>
                            <Text style={styles.capsuleText}>{item}</Text>
                            {item !== 'All' && (
                                <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteButton}>
                                    <Ionicons name="close" size={16} color="#666666" />
                                </TouchableOpacity>
                            )}
                        </View>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 16,
        justifyContent: 'space-between',
    },
    headerSpacer: {
        width: 32,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    closeButton: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: 'rgba(0,0,0,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    inputContainer: {
        flexDirection: 'row',
        padding: 16,
        alignItems: 'center',
    },
    input: {
        flex: 1,
        height: 36,
        backgroundColor: '#F0F0F0',
        borderRadius: 24,
        paddingHorizontal: 16,
        marginRight: 12,
        fontSize: 16,
        color: colors.textPrimary,
    },
    addButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#E8E8E8',
        alignItems: 'center',
        justifyContent: 'center',
    },
    listContent: {
        padding: 16,
        paddingBottom: 40,
    },
    wrapContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    capsuleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E8E8E8',
        borderRadius: 20,
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginBottom: 8,
    },
    capsuleText: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textPrimary,
        marginRight: 4,
    },
    deleteButton: {
        marginLeft: 4,
        padding: 2,
        backgroundColor: 'rgba(0,0,0,0.15)',
        borderRadius: 10,
    },
});
