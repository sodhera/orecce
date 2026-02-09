import React from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../styles/colors';
import { CollectionCard, CollectionData } from '../components';
import { FeedPostCard, FeedPostData } from '../components';

// Mock data for development
const MOCK_COLLECTIONS: CollectionData[] = [
    { id: '1', name: 'Tech News', postCount: 12 },
    { id: '2', name: 'Design Inspiration', postCount: 8 },
    { id: '3', name: 'Read Later', postCount: 24 },
    { id: '4', name: 'Favorites', postCount: 5 },
];

export function SavedScreen() {
    const navigation = useNavigation<any>();

    const handleCollectionPress = (collection: CollectionData) => {
        navigation.navigate('CollectionDetail', {
            collectionId: collection.id,
            collectionName: collection.name,
        });
    };

    const renderCollection = ({ item }: { item: CollectionData }) => (
        <CollectionCard collection={item} onPress={handleCollectionPress} />
    );

    const renderSeparator = () => <View style={styles.separator} />;

    return (
        <View style={styles.container}>
            {MOCK_COLLECTIONS.length > 0 ? (
                <FlatList
                    data={MOCK_COLLECTIONS}
                    renderItem={renderCollection}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                />
            ) : (
                <View style={styles.emptyContainer}>
                    <Text style={styles.title}>Saved</Text>
                    <Text style={styles.subtitle}>Your saved items will appear here</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    listContent: {
        paddingVertical: 8,
    },
    separator: {
        height: 1,
        backgroundColor: colors.surface,
        marginLeft: 84, // Align with text after thumbnail
    },
    emptyContainer: {
        flex: 1,
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
