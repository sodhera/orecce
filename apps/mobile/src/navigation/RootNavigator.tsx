import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BottomTabNavigator } from './BottomTabNavigator';
import { ProfileScreen } from '../screens/ProfileScreen';
import { InterestsScreen } from '../screens/InterestsScreen';
import { PostDetailsScreen } from '../screens/PostDetailsScreen';
import { CreateCollectionScreen } from '../screens/CreateCollectionScreen';
import { CollectionDetailScreen } from '../screens/CollectionDetailScreen';
import { FeedPostData } from '../components/FeedPostCard';

export type RootStackParamList = {
    Main: undefined;
    Profile: undefined;
    Interests: undefined;
    PostDetails: { post: FeedPostData };
    CreateCollection: undefined;
    CollectionDetail: { collectionId: string; collectionName: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Main" component={BottomTabNavigator} />
            <Stack.Screen
                name="Profile"
                component={ProfileScreen}
                options={{
                    presentation: 'modal',
                    headerShown: false,
                    title: 'Profile'
                }}
            />
            <Stack.Screen
                name="Interests"
                component={InterestsScreen}
                options={{
                    headerShown: false,
                    title: 'Interests'
                }}
            />
            <Stack.Screen
                name="PostDetails"
                component={PostDetailsScreen}
                options={{
                    headerShown: false,
                }}
            />
            <Stack.Screen
                name="CreateCollection"
                component={CreateCollectionScreen}
                options={{
                    presentation: 'modal',
                    headerShown: false,
                    title: 'Create a collection'
                }}
            />
            <Stack.Screen
                name="CollectionDetail"
                component={CollectionDetailScreen}
                options={{
                    headerShown: false,
                }}
            />
        </Stack.Navigator>
    );
}
