import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet, View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { HomeScreen } from '../screens/HomeScreen';
import { ExploreScreen } from '../screens/ExploreScreen';
import { SavedScreen } from '../screens/SavedScreen';
import { InboxScreen } from '../screens/InboxScreen';
import { colors } from '../styles/colors';
import { BottomSheetMenu } from '../components/BottomSheetMenu';

export type BottomTabParamList = {
    Home: undefined;
    Explore: undefined;
    Saved: undefined;
    Inbox: undefined;
};

const Tab = createBottomTabNavigator<BottomTabParamList>();

// Profile button component for header
function ProfileHeaderButton({ onPress }: { onPress: () => void }) {
    return (
        <TouchableOpacity style={styles.profileButton} onPress={onPress}>
            <Ionicons name="person-circle-outline" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
    );
}

// Inbox Header Menu using BottomSheetMenu
function InboxHeaderMenu() {
    const [menuVisible, setMenuVisible] = useState(false);

    const handleMarkAllRead = () => {
        console.log('Mark all as read');
        setMenuVisible(false);
    };

    const handleEditSettings = () => {
        console.log('Edit notification settings');
        setMenuVisible(false);
    };

    return (
        <>
            <TouchableOpacity
                style={styles.profileButton}
                onPress={() => setMenuVisible(true)}
            >
                <Ionicons name="ellipsis-horizontal" size={24} color={colors.textPrimary} />
            </TouchableOpacity>

            <BottomSheetMenu
                visible={menuVisible}
                onClose={() => setMenuVisible(false)}
            >
                <TouchableOpacity
                    style={styles.bottomSheetItem}
                    onPress={handleMarkAllRead}
                    activeOpacity={0.7}
                >
                    <View style={styles.iconContainer}>
                        <Ionicons name="checkmark-done-outline" size={24} color={colors.textPrimary} />
                    </View>
                    <Text style={styles.bottomSheetItemText}>Mark all as read</Text>
                </TouchableOpacity>

                <View style={styles.bottomSheetDivider} />

                <TouchableOpacity
                    style={styles.bottomSheetItem}
                    onPress={handleEditSettings}
                    activeOpacity={0.7}
                >
                    <View style={styles.iconContainer}>
                        <Ionicons name="notifications-outline" size={24} color={colors.textPrimary} />
                    </View>
                    <Text style={styles.bottomSheetItemText}>Edit notification settings</Text>
                </TouchableOpacity>
            </BottomSheetMenu>
        </>
    );
}

export function BottomTabNavigator() {
    const navigation = useNavigation<any>(); // Using 'any' for simplicity or import RootStackParamList

    const handleProfilePress = () => {
        navigation.navigate('Profile');
    };

    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarIcon: ({ focused, color, size }) => {
                    let iconName: keyof typeof Ionicons.glyphMap;

                    switch (route.name) {
                        case 'Home':
                            iconName = focused ? 'home' : 'home-outline';
                            break;
                        case 'Explore':
                            iconName = focused ? 'search' : 'search-outline';
                            break;
                        case 'Saved':
                            iconName = focused ? 'bookmark' : 'bookmark-outline';
                            break;
                        case 'Inbox':
                            iconName = focused ? 'notifications' : 'notifications-outline';
                            break;
                        default:
                            iconName = 'ellipse';
                    }

                    return <Ionicons name={iconName} size={size} color={color} />;
                },
                tabBarActiveTintColor: colors.primary,
                tabBarInactiveTintColor: colors.textMuted,
                tabBarStyle: {
                    backgroundColor: colors.background,
                    borderTopColor: colors.surface,
                    borderTopWidth: 1,
                    paddingBottom: 20,
                    paddingTop: 8,
                    height: 86,
                },
                tabBarLabelStyle: {
                    fontSize: 12,
                },
                headerShown: true,
                headerStyle: {
                    backgroundColor: colors.background,
                    elevation: 0,
                    shadowOpacity: 0,
                    borderBottomWidth: 0,
                },
                headerTitleAlign: 'left',
                headerTitleStyle: {
                    color: colors.textPrimary,
                    fontWeight: '600',
                    fontSize: 18,
                },
                headerRight: () => <ProfileHeaderButton onPress={handleProfilePress} />,
            })}
        >
            <Tab.Screen name="Home" component={HomeScreen} options={{ headerTitle: 'Orecce', tabBarLabel: 'Home' }} />
            <Tab.Screen
                name="Explore"
                component={ExploreScreen}
                options={{
                    headerRight: () => (
                        <TouchableOpacity
                            style={styles.profileButton}
                            onPress={() => navigation.navigate('Rss')}
                        >
                            <Ionicons name="logo-rss" size={24} color={colors.textPrimary} />
                        </TouchableOpacity>
                    ),
                }}
            />
            <Tab.Screen
                name="Saved"
                component={SavedScreen}
                options={{
                    headerRight: () => (
                        <TouchableOpacity
                            style={styles.profileButton}
                            onPress={() => navigation.navigate('CreateCollection')}
                        >
                            <Ionicons name="add" size={28} color={colors.textPrimary} />
                        </TouchableOpacity>
                    ),
                }}
            />
            <Tab.Screen
                name="Inbox"
                component={InboxScreen}
                options={{
                    headerRight: () => <InboxHeaderMenu />,
                }}
            />
        </Tab.Navigator>
    );
}

const styles = StyleSheet.create({
    profileButton: {
        marginRight: 16,
        padding: 4,
    },
    bottomSheetItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 20,
    },
    iconContainer: {
        width: 40,
        alignItems: 'center',
        marginRight: 16,
    },
    bottomSheetItemText: {
        fontSize: 16,
        color: colors.textPrimary,
        fontWeight: '500',
    },
    bottomSheetDivider: {
        height: 1,
        backgroundColor: colors.surface,
        marginHorizontal: 20,
    },
});
