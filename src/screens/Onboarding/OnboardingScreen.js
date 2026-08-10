// Onboarding Screen
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../constants/colors';
import { SIZES, FONTS } from '../../constants/theme';

const { width } = Dimensions.get('window');

const slides = [
  {
    id: '1',
    emoji: '⚡',
    title: 'Welcome to WattWise',
    description: 'Your smart energy monitoring system for your apartment room. Monitor, control, and save energy efficiently.',
  },
  {
    id: '2',
    emoji: '🔌',
    title: 'Monitor Your Outlets',
    description: 'WattWise supports 2 smart outlets. Track real-time energy usage, voltage, current, and cost per appliance.',
  },
  {
    id: '3',
    emoji: '📱',
    title: 'Supported Appliances',
    description: 'Designed for low-voltage devices:\n\n📱 Phone Charger\n💻 Laptop Charger\n🌀 Electric Fan\n📺 TV\n💡 LED Lamp\n🎮 Gaming Console\n📻 Radio/Speaker',
  },
  {
    id: '4',
    emoji: '❌',
    title: 'Unsupported Appliances',
    description: 'WattWise does NOT support high-voltage appliances:\n\n❌ Air Conditioner\n❌ Washing Machine\n❌ Dryer\n❌ Electric Stove\n❌ Water Heater\n❌ Refrigerator',
  },
  {
    id: '5',
    emoji: '📊',
    title: 'Track Your Energy',
    description: 'View daily, weekly, and monthly energy analytics. Compare usage and monitor your electricity bill in real-time.',
  },
  {
    id: '6',
    emoji: '⏱️',
    title: 'Smart Scheduling',
    description: 'Set timers and schedules for your appliances. Choose countdown timers or specific times and days of the week.',
  },
  {
    id: '7',
    emoji: '🛡️',
    title: 'Power Safety Management',
    description: 'WattWise protects your devices with 3 safety stages:\n\n⚠️ Warning Stage\n🔶 Limit Stage\n🔴 Cut-off Stage\n\nPrevents overload and unsafe power usage.',
  },
  {
    id: '8',
    emoji: '💰',
    title: 'Budget Tracking',
    description: 'Set your monthly electricity budget and track your spending. Get alerts when you are approaching your limit.',
  },
  {
    id: '9',
    emoji: '🧾',
    title: 'Set Your PELCO III Rate',
    description: 'Every peso figure in WattWise is computed on the PELCO III residential tariff.\n\nOne last step: open Settings → Electricity Rates and enter the generation rate printed on your bill (or from pelco3.org/rates.php).\n\nUntil you do, costs are estimates based on default rates.',
  },
];

export const OnboardingScreen = ({ onFinish }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      handleFinish();
    }
  };

  const handleSkip = async () => {
    await handleFinish();
  };
  
  const handleFinish = async () => {
    await AsyncStorage.setItem('onboarding_complete', 'true');
    onFinish(); // triggers re-check in AppNavigator
  };


  const renderSlide = ({ item }) => (
    <View style={styles.slide}>
      <Text style={styles.emoji}>{item.emoji}</Text>
      <Text style={styles.slideTitle}>{item.title}</Text>
      <Text style={styles.slideDescription}>{item.description}</Text>
    </View>
  );

  const renderDots = () => (
    <View style={styles.dotsContainer}>
      {slides.map((_, index) => {
        const inputRange = [
          (index - 1) * width,
          index * width,
          (index + 1) * width,
        ];

        const dotWidth = scrollX.interpolate({
          inputRange,
          outputRange: [8, 24, 8],
          extrapolate: 'clamp',
        });

        const opacity = scrollX.interpolate({
          inputRange,
          outputRange: [0.3, 1, 0.3],
          extrapolate: 'clamp',
        });

        return (
          <Animated.View
            key={index}
            style={[styles.dot, { width: dotWidth, opacity }]}
          />
        );
      })}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Skip Button */}
      <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${((currentIndex + 1) / slides.length) * 100}%` },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {currentIndex + 1}/{slides.length}
        </Text>
      </View>

      {/* Slides */}
      <Animated.FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
        scrollEventThrottle={16}
      />

      {/* Dots */}
      {renderDots()}

      {/* Bottom Buttons */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity
          style={styles.nextButton}
          onPress={handleNext}
          activeOpacity={0.8}
        >
          <Text style={styles.nextButtonText}>
            {currentIndex === slides.length - 1 ? 'Get Started' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  skipButton: {
    alignSelf: 'flex-end',
    padding: SIZES.padding,
  },
  skipText: {
    ...FONTS.body,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.padding * 1.5,
    marginBottom: 8,
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  progressText: {
    ...FONTS.small,
    color: COLORS.textLight,
  },
  slide: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SIZES.padding * 2,
  },
  emoji: {
    fontSize: 80,
    marginBottom: 32,
  },
  slideTitle: {
    ...FONTS.h2,
    color: COLORS.textDark,
    textAlign: 'center',
    marginBottom: 16,
  },
  slideDescription: {
    ...FONTS.body,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 24,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  bottomContainer: {
    paddingHorizontal: SIZES.padding * 1.5,
    paddingBottom: SIZES.padding,
  },
  nextButton: {
    backgroundColor: COLORS.primary,
    height: SIZES.buttonHeight,
    borderRadius: SIZES.radius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextButtonText: {
    ...FONTS.h4,
    color: COLORS.white,
    fontWeight: '600',
  },
});