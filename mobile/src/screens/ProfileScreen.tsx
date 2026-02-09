import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SectionList, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../styles/colors';
import { useAuth } from '../hooks/useAuth';
import { useUser, getDisplayName, getUserInitials } from '../hooks/useUser';
import { ScreenHeader } from '../components/ScreenHeader';

type SettingsItem = {
    id: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    value?: string;
    type?: 'link' | 'info';
};

const SECTIONS = [
    {
        title: 'Account',
        data: [
            { id: 'email', label: 'Email', icon: 'mail-outline', value: '', type: 'info' },
            { id: 'password', label: 'Change password', icon: 'lock-closed-outline', type: 'link' },
        ],
    },
    {
        title: 'General', // Implicit section based on design grouping
        data: [
            { id: 'interests', label: 'Interests', icon: 'heart-outline', type: 'link' },
            { id: 'personalization', label: 'Personalization', icon: 'options-outline', type: 'link' },
            { id: 'notifications', label: 'Notifications', icon: 'notifications-outline', type: 'link' },
            { id: 'data', label: 'Data controls', icon: 'bar-chart-outline', type: 'link' },
        ]
    }
];

export function ProfileScreen() {
    const { user: firebaseUser, signOut } = useAuth();
    const { user: backendUser, isLoading } = useUser();
    const navigation = useNavigation();

    // Get display name and initials using the helper functions
    const displayName = getDisplayName(backendUser, firebaseUser);
    const initials = getUserInitials(backendUser, firebaseUser);

    // Update email value dynamically with verification status
    const isEmailVerified = firebaseUser?.emailVerified ?? false;
    const sections = SECTIONS.map(section => ({
        ...section,
        data: section.data.map(item => {
            if (item.id === 'email') {
                return {
                    ...item,
                    value: firebaseUser?.email || '',
                    isUnverified: !isEmailVerified
                };
            }
            return item;
        })
    }));

    const handleVerifyEmail = async () => {
        // Import and use sendEmailVerification
        const { sendEmailVerification } = require('firebase/auth');
        const { auth } = require('../config/firebase');
        if (auth.currentUser) {
            try {
                await sendEmailVerification(auth.currentUser);
                // Show success message (you could use a Toast here)
                alert('Verification email sent! Please check your inbox.');
            } catch (error) {
                alert('Failed to send verification email. Please try again.');
            }
        }
    };

    const handlePress = (item: SettingsItem) => {
        if (item.id === 'interests') {
            // @ts-ignore - navigation types need update
            navigation.navigate('Interests');
        }
        // Handle other items...
    };

    const renderItem = ({ item }: { item: any }) => (
        <View>
            <View style={styles.itemContainer}>
                <View style={styles.itemLeft}>
                    <Ionicons name={item.icon} size={22} color={colors.textPrimary} style={styles.itemIcon} />
                    <Text style={styles.itemLabel}>{item.label}</Text>
                </View>
                <View style={styles.itemRight}>
                    {item.value && (
                        <Text style={[
                            styles.itemValue,
                            item.isUnverified && styles.itemValueUnverified
                        ]}>
                            {item.value}
                        </Text>
                    )}
                    {item.type !== 'info' && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
                </View>
            </View>
            {/* Show Verify Email button for unverified emails - on its own row, right-aligned */}
            {item.id === 'email' && item.isUnverified && (
                <View style={styles.verifyEmailRow}>
                    <TouchableOpacity
                        style={styles.verifyEmailButton}
                        onPress={handleVerifyEmail}
                    >
                        <Text style={styles.verifyEmailText}>Verify Email</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );

    const renderSectionHeader = ({ section: { title } }: { section: { title: string } }) => {
        if (title === 'General') return <View style={styles.sectionSeparator} />;
        return <Text style={styles.sectionHeader}>{title}</Text>;
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <ScreenHeader title="Settings" onClose={() => navigation.goBack()} />

            <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
                {/* Profile Info */}
                <View style={styles.profileSection}>
                    <View style={styles.avatarContainer}>
                        {/* Avatar - User's Initials */}
                        <Text style={styles.avatarText}>{initials}</Text>
                    </View>
                    <Text style={styles.userName}>{displayName}</Text>
                    <Text style={styles.userHandle}>{firebaseUser?.email || ''}</Text>

                    <TouchableOpacity style={styles.editProfileButton}>
                        <Text style={styles.editProfileText}>Edit profile</Text>
                    </TouchableOpacity>
                </View>

                {/* Settings List */}
                <View style={styles.settingsList}>
                    {sections.map((section, sectionIndex) => (
                        <View key={sectionIndex}>
                            {renderSectionHeader({ section })}
                            {section.data.map((item, itemIndex) => (
                                <React.Fragment key={item.id}>
                                    {renderItem({ item })}
                                    {itemIndex < section.data.length - 1 && <View style={styles.itemSeparator} />}
                                </React.Fragment>
                            ))}
                        </View>
                    ))}

                    {/* Sign Out Button */}
                    <TouchableOpacity style={styles.signOutButton} onPress={() => {
                        Alert.alert(
                            'Sign Out',
                            'Are you sure you want to sign out?',
                            [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Sign Out', style: 'destructive', onPress: signOut },
                            ]
                        );
                    }}>
                        <Ionicons name="log-out-outline" size={22} color={colors.error} style={styles.itemIcon} />
                        <Text style={styles.signOutText}>Sign Out</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background, // Light background per request "not dark mode"
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 40,
    },
    profileSection: {
        alignItems: 'center',
        marginBottom: 24,
        marginTop: 8,
    },
    avatarContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: colors.textSecondary, // Use a neutral color for avatar support
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    avatarText: {
        fontSize: 32,
        color: colors.background,
        fontWeight: '400',
    },
    userName: {
        fontSize: 24,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 4,
    },
    userHandle: {
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: 16,
    },
    editProfileButton: {
        paddingVertical: 8,
        paddingHorizontal: 20,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.surface,
    },
    editProfileText: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textPrimary,
    },
    settingsList: {
        backgroundColor: colors.background,
    },
    sectionHeader: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textSecondary,
        marginLeft: 16,
        marginBottom: 8,
        marginTop: 16,
    },
    sectionSeparator: {
        height: 24,
    },
    itemContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        justifyContent: 'space-between',
    },
    itemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    itemIcon: {
        marginRight: 16,
        width: 24,
    },
    itemLabel: {
        fontSize: 16,
        color: colors.textPrimary,
    },
    itemRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    itemValue: {
        fontSize: 16,
        color: colors.textSecondary,
        marginRight: 8,
    },
    itemSeparator: {
        height: 1,
        backgroundColor: colors.surface,
        marginLeft: 56, // Indent separator to align with text
    },
    signOutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        marginTop: 24,
    },
    signOutText: {
        fontSize: 16,
        color: colors.error,
        fontWeight: '500',
    },
    itemValueUnverified: {
        color: colors.error,
    },
    verifyEmailRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingRight: 16,
        marginTop: -4,
        marginBottom: 8,
    },
    verifyEmailButton: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: colors.error,
        borderRadius: 14,
    },
    verifyEmailText: {
        fontSize: 14,
        color: colors.white,
        fontWeight: '500',
    },
});
