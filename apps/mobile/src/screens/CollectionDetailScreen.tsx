import React from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { colors } from '../styles/colors';
import { FeedPostCard, FeedPostData, ScreenHeader } from '../components';

type CollectionDetailRouteParams = {
    CollectionDetail: {
        collectionId: string;
        collectionName: string;
    };
};

// Mock posts for development
const MOCK_POSTS: FeedPostData[] = [
    {
        id: '1',
        type: 'text',
        topic: 'Technology',
        content: 'AI is transforming the way we work and live. From automated customer service to personalized recommendations, machine learning is becoming increasingly integrated into our daily experiences.',
        votes: 42,
        userVote: 0,
        isSaved: true,
        date: '2h ago',
    },
    {
        id: '2',
        type: 'text',
        topic: 'Design',
        content: 'The best interfaces are invisible. Great design should feel natural and intuitive, guiding users without them even noticing the underlying structure.',
        votes: 28,
        userVote: 1,
        isSaved: true,
        date: '5h ago',
    },
    {
        id: '3',
        type: 'text',
        topic: 'Productivity',
        content: 'Time blocking has completely changed how I approach my workday. By dedicating specific hours to focused work, I have doubled my output.',
        votes: 15,
        userVote: 0,
        isSaved: true,
        date: '1d ago',
    },
];

export function CollectionDetailScreen() {
    const navigation = useNavigation();
    const route = useRoute<RouteProp<CollectionDetailRouteParams, 'CollectionDetail'>>();
    const { collectionName } = route.params;

    const handleGoBack = () => {
        navigation.goBack();
    };

    const renderPost = ({ item }: { item: FeedPostData }) => (
        <FeedPostCard
            post={item}
            onUpvote={(id) => console.log('Upvote:', id)}
            onDownvote={(id) => console.log('Downvote:', id)}
            onSave={(id) => console.log('Save:', id)}
            onShare={(id) => console.log('Share:', id)}
        />
    );

    const renderSeparator = () => <View style={styles.separator} />;

    return (
        <SafeAreaView style={styles.safeArea} edges={['top']}>
            <View style={styles.container}>
                {/* Header */}
                <ScreenHeader
                    title={collectionName}
                    onBack={handleGoBack}
                />

                {/* Posts List */}
                <FlatList
                    data={MOCK_POSTS}
                    renderItem={renderPost}
                    keyExtractor={(item) => item.id}
                    ItemSeparatorComponent={renderSeparator}
                    contentContainerStyle={styles.listContent}
                />
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: colors.background,
    },
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    listContent: {
        paddingBottom: 20,
    },
    separator: {
        height: 1,
        backgroundColor: colors.surface,
    },
});
