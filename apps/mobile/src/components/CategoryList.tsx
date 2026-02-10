import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { CategoryCapsule } from './CategoryCapsule';
import { colors } from '../styles/colors';

import { useInterests } from '../context/InterestsContext';

export function CategoryList() {
    const { interests } = useInterests();
    const [selectedCategory, setSelectedCategory] = useState<string>('All');

    const handleCategoryPress = (category: string) => {
        setSelectedCategory(category);
    };

    return (
        <View style={styles.wrapper}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.container}
            >
                {interests.map((category) => (
                    <CategoryCapsule
                        key={category}
                        label={category}
                        isActive={selectedCategory === category}
                        onPress={() => handleCategoryPress(category)}
                    />
                ))}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        backgroundColor: colors.background,
        borderBottomWidth: 1,
        borderBottomColor: colors.surface,
        paddingVertical: 12,
    },
    container: {
        paddingHorizontal: 16,
    },
});
